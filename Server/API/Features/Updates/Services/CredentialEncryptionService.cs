using System.Security.Cryptography;

namespace LensAssemblyMonitoringWeb.Features.Updates.Services
{
    public interface ICredentialEncryptionService
    {
        string Encrypt(string plainText);
        string Decrypt(string cipherText);
    }

    public class CredentialEncryptionService : ICredentialEncryptionService
    {
        private readonly byte[] _key;

        public CredentialEncryptionService(IConfiguration configuration)
        {
            var keyBase64 = configuration["EncryptionSettings:Key"];
            if (string.IsNullOrWhiteSpace(keyBase64))
            {
                throw new InvalidOperationException(
                    "EncryptionSettings:Key is missing from appsettings.json. " +
                    "Generate a 32-byte base64 key and add it.");
            }
            _key = Convert.FromBase64String(keyBase64);
            if (_key.Length != 32)
            {
                throw new InvalidOperationException("Encryption key must be exactly 32 bytes (256 bits).");
            }
        }

        public string Encrypt(string plainText)
        {
            if (string.IsNullOrEmpty(plainText)) return string.Empty;

            using var aes = Aes.Create();
            aes.Key = _key;
            aes.GenerateIV();

            using var encryptor = aes.CreateEncryptor();
            var plainBytes = System.Text.Encoding.UTF8.GetBytes(plainText);
            var cipherBytes = encryptor.TransformFinalBlock(plainBytes, 0, plainBytes.Length);

            // Prepend IV to ciphertext: [16-byte IV][ciphertext]
            var result = new byte[aes.IV.Length + cipherBytes.Length];
            Buffer.BlockCopy(aes.IV, 0, result, 0, aes.IV.Length);
            Buffer.BlockCopy(cipherBytes, 0, result, aes.IV.Length, cipherBytes.Length);

            return Convert.ToBase64String(result);
        }

        public string Decrypt(string cipherText)
        {
            if (string.IsNullOrEmpty(cipherText)) return string.Empty;

            var fullCipher = Convert.FromBase64String(cipherText);

            using var aes = Aes.Create();
            aes.Key = _key;

            // Extract IV (first 16 bytes)
            var iv = new byte[16];
            Buffer.BlockCopy(fullCipher, 0, iv, 0, 16);
            aes.IV = iv;

            // Extract ciphertext (remaining bytes)
            var cipherBytes = new byte[fullCipher.Length - 16];
            Buffer.BlockCopy(fullCipher, 16, cipherBytes, 0, cipherBytes.Length);

            using var decryptor = aes.CreateDecryptor();
            var plainBytes = decryptor.TransformFinalBlock(cipherBytes, 0, cipherBytes.Length);

            return System.Text.Encoding.UTF8.GetString(plainBytes);
        }
    }
}


