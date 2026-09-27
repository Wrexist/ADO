// Windows execution boundary. This is process containment, NOT a filesystem sandbox.
// Compile with the Windows .NET Framework compiler; no downloaded native dependency.
using System;
using System.ComponentModel;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;

internal static class JobHost
{
    [StructLayout(LayoutKind.Sequential)] struct Limits {
        public long ProcessTime, JobTime; public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet; public uint ActiveLimit;
        public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)] struct IoCounters {
        public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes;
    }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public Limits Basic; public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)] struct Accounting {
        public long User, Kernel, PeriodUser, PeriodKernel;
        public uint PageFaults, Total, Active, Terminated;
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct Startup {
        public uint Size; public string Reserved, Desktop, Title;
        public uint X, Y, Width, Height, XChars, YChars, Fill, Flags;
        public ushort Show, ReservedSize; public IntPtr ReservedData, Stdin, Stdout, Stderr;
    }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo {
        public IntPtr Process, Thread; public uint Pid, Tid;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits limits, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting info, uint size, IntPtr length);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool CreateProcessW(string app, StringBuilder args, IntPtr pa, IntPtr ta, bool inherit, uint flags, IntPtr env, string cwd, ref Startup startup, out ProcessInfo info);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr handle, uint ms);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetProcessTimes(IntPtr process, out long created, out long exited, out long kernel, out long user);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int handle);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    static readonly object JobLock = new object();
    static IntPtr job = IntPtr.Zero;
    static int cancelled;
    static void Check(bool ok) { if (!ok) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static void Cancel() {
        Interlocked.Exchange(ref cancelled, 1);
        lock (JobLock) { if (job != IntPtr.Zero) TerminateJobObject(job, 137); }
    }
    static string Quote(string value) {
        // Windows argv quoting; no command interpreter ever sees these arguments.
        var output = new StringBuilder("\"");
        int slashes = 0;
        foreach (char ch in value) {
            if (ch == '\\') { slashes++; continue; }
            if (ch == '"') { output.Append('\\', slashes * 2 + 1); output.Append(ch); }
            else { output.Append('\\', slashes); output.Append(ch); }
            slashes = 0;
        }
        output.Append('\\', slashes * 2); output.Append('"'); return output.ToString();
    }
    static bool Empty() {
        Accounting info;
        Check(QueryInformationJobObject(job, 1, out info, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero));
        return info.Active == 0;
    }
    static void SaveReceipt(string path, string key, string payload, JavaScriptSerializer json) {
        if (path == null) return;
        if (!Path.IsPathRooted(path) || key == null || key.Length != 64) throw new InvalidOperationException("Invalid receipt configuration");
        byte[] secret = new byte[32];
        for (int i = 0; i < secret.Length; i++) secret[i] = Convert.ToByte(key.Substring(i * 2, 2), 16);
        string mac;
        using (var hmac = new HMACSHA256(secret)) mac = BitConverter.ToString(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload))).Replace("-", "").ToLowerInvariant();
        byte[] bytes = Encoding.UTF8.GetBytes(json.Serialize(new { payload = payload, mac = mac }));
        string temporary = path + ".tmp";
        using (var file = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough)) {
            file.Write(bytes, 0, bytes.Length); file.Flush(true);
        }
        // Publish once, only after all bytes have been flushed. Never replace an old receipt.
        File.Move(temporary, path);
    }
    static int Main(string[] args) {
        if (args.Length < 3) return 125;
        ProcessInfo process = new ProcessInfo();
        bool assigned = false;
        NamedPipeClientStream pipe = null;
        StreamWriter writer = null;
        var json = new JavaScriptSerializer();
        try {
            string id = Guid.Parse(args[1]).ToString();
            string jobName = "Local\\ControlOS." + id;
            pipe = new NamedPipeClientStream(".", args[0], PipeDirection.InOut, PipeOptions.Asynchronous);
            pipe.Connect(10000);
            var reader = new StreamReader(pipe, new UTF8Encoding(false));
            writer = new StreamWriter(pipe, new UTF8Encoding(false)); writer.AutoFlush = true;
            string initial = reader.ReadLine();
            if (initial == null) return 125;
            var configuration = json.Deserialize<Dictionary<string, object>>(initial);
            string receiptPath = configuration.ContainsKey("receiptPath") ? configuration["receiptPath"] as string : null;
            string receiptKey = configuration.ContainsKey("receiptKey") ? configuration["receiptKey"] as string : null;
            job = CreateJobObject(IntPtr.Zero, jobName);
            Check(job != IntPtr.Zero);
            // A unique identity must never attach to an existing job.
            if (Marshal.GetLastWin32Error() == 183) throw new InvalidOperationException("Job identity collision");
            var limits = new ExtendedLimits(); limits.Basic.Flags = 0x2000; // KILL_ON_JOB_CLOSE; no breakaway
            Check(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))));
            var startup = new Startup(); startup.Size = (uint)Marshal.SizeOf(typeof(Startup));
            startup.Flags = 0x100; // STARTF_USESTDHANDLES
            startup.Stdin = GetStdHandle(-10); startup.Stdout = GetStdHandle(-11); startup.Stderr = GetStdHandle(-12);
            foreach (IntPtr handle in new[] { startup.Stdin, startup.Stdout, startup.Stderr }) Check(SetHandleInformation(handle, 1, 1));
            var command = new StringBuilder();
            for (int i = 2; i < args.Length; i++) { if (i > 2) command.Append(' '); command.Append(Quote(args[i])); }
            // Absolute application path removes ambiguous executable/path lookup.
            if (!Path.IsPathRooted(args[2])) throw new InvalidOperationException("Executable path must be absolute");
            Check(CreateProcessW(args[2], command, IntPtr.Zero, IntPtr.Zero, true, 0x08000004, IntPtr.Zero, null, ref startup, out process));
            Check(AssignProcessToJobObject(job, process.Process)); assigned = true;
            long created, exited, kernel, user;
            Check(GetProcessTimes(process.Process, out created, out exited, out kernel, out user));
            string creationTime = created.ToString(System.Globalization.CultureInfo.InvariantCulture);
            writer.WriteLine(json.Serialize(new { type = "prepared", version = 2, id = id, jobName = jobName, pid = process.Pid, creationTime = creationTime }));
            // The server persists identity before acknowledging. EOF/cancel never runs user code.
            string acknowledgement = reader.ReadLine();
            var decision = acknowledgement == null ? new Dictionary<string, object>() : json.Deserialize<Dictionary<string, object>>(acknowledgement);
            if (!decision.ContainsKey("action") || (string)decision["action"] != "resume") Cancel();
            else {
                if (ResumeThread(process.Thread) == UInt32.MaxValue) throw new Win32Exception(Marshal.GetLastWin32Error());
                var watcher = new Thread(delegate() {
                    try { reader.ReadLine(); } catch { /* broken owner pipe */ }
                    Cancel();
                });
                watcher.IsBackground = true; watcher.Start();
            }
            if (WaitForSingleObject(process.Process, UInt32.MaxValue) != 0) throw new Win32Exception(Marshal.GetLastWin32Error());
            uint exitCode; Check(GetExitCodeProcess(process.Process, out exitCode));
            // A successful root exit must not leave background writers behind.
            Check(TerminateJobObject(job, 137));
            var timer = Stopwatch.StartNew();
            while (!Empty()) {
                if (timer.ElapsedMilliseconds > 10000) throw new TimeoutException("Job termination could not be confirmed");
                Thread.Sleep(10);
            }
            int result = cancelled != 0 ? -1 : unchecked((int)exitCode);
            SaveReceipt(receiptPath, receiptKey, json.Serialize(new { version = 1, id = id, jobName = jobName, pid = process.Pid, creationTime = creationTime, activeProcesses = 0, exitCode = result, recordedUtc = DateTime.UtcNow.ToString("o") }), json);
            writer.WriteLine(json.Serialize(new { type = "empty", version = 2, id = id, activeProcesses = 0, exitCode = result }));
            return result;
        } catch (Exception error) {
            try { Console.Error.WriteLine("ControlOS process host: " + error.Message); } catch { /* owner already exited */ }
            return 125;
        } finally {
            // Assignment failure must not strand a suspended process outside the job.
            if (!assigned && process.Process != IntPtr.Zero) TerminateProcess(process.Process, 137);
            lock (JobLock) {
                if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
            }
            if (process.Thread != IntPtr.Zero) CloseHandle(process.Thread);
            if (process.Process != IntPtr.Zero) CloseHandle(process.Process);
            if (pipe != null) pipe.Dispose();
        }
    }
}
