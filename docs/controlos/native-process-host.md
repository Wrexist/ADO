# Windows owned process host

Claude and Codex runs on Windows now use `apps/server/native/JobHost.cs` through
`spawnOwned`. There is no fallback to an uncontained agent launch when the host
is unavailable. POSIX agents still use the existing process-group adapter and
do not claim the Windows termination guarantee.

## Launch and stop protocol

1. The server opens a unique local named pipe and starts the packaged native
   host with the existing minimal environment allow-list.
2. The host creates a uniquely named Job Object with kill-on-close and without
   breakaway permission, then creates the agent suspended and assigns it to
   that job. Arguments use Windows argv quoting, never a command interpreter.
3. The host reports a versioned identity: random execution ID, job name, root
   PID and exact creation FILETIME as a decimal string. The runner persists
   this identity in SQLite before authorizing resume. Failed persistence or
   denied policy cannot resume the agent.
4. Cancel uses the private control channel, never a recovered PID. Codex retains
   its protocol interrupt attempt before the existing forced-stop deadline.
   Loss of the owner's control connection terminates the assigned job.
5. Root exit also terminates any remaining job members. The host queries active
   membership until zero, reports confirmation and exits. Only then does the
   Windows process-completion promise resolve. A lost host or missing final
   confirmation rejects that promise and retains the runner's writer lock.

`runs.process_identity` stores the launch identity. `process_termination` is
`unconfirmed` until confirmation is durably recorded with the terminal run
state. Legacy and unsupported records remain null; migration does not invent
evidence. The run view exposes confirmation and blocks redispatch from an
unconfirmed result.

## Local evidence

- `ownedProcess.test.ts`: quotes, Unicode, empty arguments, stdout/stderr,
  suspended launch denial, failed identity persistence, detached descendants,
  owner-process disappearance and a two-level descendant tree.
- `nativeProcess.test.ts`: the real host inside the runner, persisted identity
  before execution, three-process cancellation before the next writer, and
  quarantine when the host is killed without delivering confirmation.
- Existing Codex protocol fixtures run through the same native host on Windows.

These fixtures do not invoke a model, spend API credit, alter pilot repositories
or establish provider login acceptance.

## Build and distribution

`node scripts/build-process-host.mjs` compiles the host using the Windows .NET
Framework x64 C# compiler under `SystemRoot`. Setup, development startup, tests
and builds call it automatically. The source digest avoids unnecessary local
recompilation. Windows desktop builds package the executable under
`resources/process-host`; installed users do not need a compiler. The existing
unsigned-installer status is unchanged. Clean-install/update acceptance remains
required, including availability of the .NET Framework runtime.

## Limits still requiring work

Job membership is process containment, not file or network isolation. Processes
created through external brokers/services may fall outside the assigned job.
Same-OS-user interference remains inside the current trust boundary. Autonomous
sandbox claims are not enabled by this implementation.

After server failure, launch identity survives but a final confirmation may
have been lost. The restarted runner still quarantines that lock. No recovery
action kills by stored PID, and absence of a root PID does not release a lock.
A durable termination receipt and validated quarantine recovery remain work.
Review/installer/verifier processes using `spawnMerged` also retain their
previous supervisor and are outside this agent-host acceptance scope.

The native implementation follows Microsoft's [Job Objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects),
[CreateProcessW](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw)
and [QueryInformationJobObject](https://learn.microsoft.com/en-us/windows/win32/api/jobapi2/nf-jobapi2-queryinformationjobobject)
contracts. These references describe API behavior; the fixture results provide
the local execution evidence.
