// Per-user DPAPI blobs, independent of Electron's deferred profile-key writes.
using System;
using System.Security.Cryptography;
using System.Text;
internal static class CredentialHost {
    static int Main(string[] args) {
        try {
            if (args.Length != 1 || (args[0] != "encrypt" && args[0] != "decrypt")) return 2;
            string line = Console.ReadLine();
            if (line == null || line.Length > 131072) return 2;
            byte[] value = Convert.FromBase64String(line);
            byte[] entropy = Encoding.UTF8.GetBytes("ControlOS.WindowsCredential.v1");
            byte[] result = args[0] == "encrypt"
                ? ProtectedData.Protect(value, entropy, DataProtectionScope.CurrentUser)
                : ProtectedData.Unprotect(value, entropy, DataProtectionScope.CurrentUser);
            Console.WriteLine(Convert.ToBase64String(result));
            return 0;
        } catch { Console.Error.WriteLine("OS credential operation failed"); return 1; }
    }
}
