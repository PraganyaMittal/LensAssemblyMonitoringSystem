using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

namespace LensAssemblyMonitoringWeb.Services
{
    public static class NetworkShareValidator
    {
        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern bool LogonUser(
            string lpszUsername,
            string lpszDomain,
            string lpszPassword,
            int dwLogonType,
            int dwLogonProvider,
            out IntPtr phToken);

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool CloseHandle(IntPtr hObject);

        public static bool ValidateCredentials(string networkPath, string username, string password, out string errorMessage)
        {
            errorMessage = string.Empty;
            
            if (string.IsNullOrWhiteSpace(username))
            {
                return true;
            }

            const int LOGON32_LOGON_NEW_CREDENTIALS = 9;
            const int LOGON32_PROVIDER_DEFAULT = 0;

            string domain = "";
            string user = username;

            if (username.Contains('\\'))
            {
                var parts = username.Split('\\', 2);
                domain = parts[0];
                user = parts[1];
            }
            else if (username.Contains('@'))
            {
                var parts = username.Split('@', 2);
                user = parts[0];
                domain = parts[1];
            }

            IntPtr token = IntPtr.Zero;
            try
            {
                bool loggedOn = LogonUser(user, domain, password, LOGON32_LOGON_NEW_CREDENTIALS, LOGON32_PROVIDER_DEFAULT, out token);

                if (!loggedOn)
                {
                    int error = Marshal.GetLastWin32Error();
                    errorMessage = $"Invalid username or password. (Logon failed with error {error})";
                    return false;
                }

#pragma warning disable CA1416
                string localError = string.Empty;
                bool success = false;
                
                using (var safeToken = new SafeAccessTokenHandle(token))
                {
                    success = WindowsIdentity.RunImpersonated(safeToken, () =>
                    {
                        try
                        {
                            var dirInfo = new DirectoryInfo(networkPath);
                            
                            if (!dirInfo.Exists)
                            {
                                localError = "Network share unreachable or access denied with these credentials.";
                                return false;
                            }
                            
                            // Test actual access by enumerating files
                            dirInfo.GetFiles();
                            
                            return true;
                        }
                        catch (UnauthorizedAccessException)
                        {
                            localError = "Access denied with the provided credentials.";
                            return false;
                        }
                        catch (Exception ex)
                        {
                            localError = $"Network share unreachable: {ex.Message}";
                            return false;
                        }
                    });
                }
                
                errorMessage = localError;
                return success;
#pragma warning restore CA1416
            }
            finally
            {
                if (token != IntPtr.Zero)
                {
                    CloseHandle(token);
                }
            }
        }
    }
}
