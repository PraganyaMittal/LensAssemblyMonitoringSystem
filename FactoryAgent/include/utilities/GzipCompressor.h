/*
 * GzipCompressor.h - GZIP compression using real zlib
 * Produces standard GZIP format compatible with .NET GZipStream
 * Uses vcpkg zlib for proper DEFLATE compression (90% reduction for text)
 */

#ifndef GZIP_COMPRESSOR_H
#define GZIP_COMPRESSOR_H

#include <vector>
#include <fstream>
#include <cstdint>
#include <string>
#include <zlib.h>

class GzipCompressor {
public:
    // Compress file and return GZIP compressed bytes
    static std::vector<uint8_t> CompressFile(const std::string& filePath, size_t& originalSize) {
        std::vector<uint8_t> result;
        
        // Read file
        std::ifstream file(filePath, std::ios::binary | std::ios::ate);
        if (!file.is_open()) return result;
        
        originalSize = static_cast<size_t>(file.tellg());
        file.seekg(0, std::ios::beg);
        
        std::vector<uint8_t> fileData(originalSize);
        if (!file.read(reinterpret_cast<char*>(fileData.data()), originalSize)) {
            return result;
        }
        file.close();
        
        // Compress to GZIP format
        result = CompressToGzip(fileData);
        
        return result;
    }
    
    // Compress raw data to GZIP format using zlib
    static std::vector<uint8_t> CompressToGzip(const std::vector<uint8_t>& data) {
        if (data.empty()) return {};
        
        // Initialize zlib stream for GZIP (windowBits = 15 + 16 for GZIP wrapper)
        z_stream strm = {};
        strm.zalloc = Z_NULL;
        strm.zfree = Z_NULL;
        strm.opaque = Z_NULL;
        
        // 15 = max window bits, +16 = write gzip header
        int ret = deflateInit2(&strm, Z_BEST_SPEED, Z_DEFLATED, 15 + 16, 8, Z_DEFAULT_STRATEGY);
        if (ret != Z_OK) {
            return {};
        }
        
        // Allocate output buffer (compressed + overhead)
        size_t maxCompressed = deflateBound(&strm, static_cast<uLong>(data.size()));
        std::vector<uint8_t> compressed(maxCompressed);
        
        // Set input
        strm.next_in = const_cast<Bytef*>(data.data());
        strm.avail_in = static_cast<uInt>(data.size());
        
        // Set output
        strm.next_out = compressed.data();
        strm.avail_out = static_cast<uInt>(compressed.size());
        
        // Compress all data in one call
        ret = deflate(&strm, Z_FINISH);
        
        if (ret != Z_STREAM_END) {
            deflateEnd(&strm);
            return {};
        }
        
        // Resize to actual compressed size
        compressed.resize(strm.total_out);
        
        deflateEnd(&strm);
        return compressed;
    }
    
    // Decompress GZIP data (for testing)
    static std::vector<uint8_t> DecompressGzip(const std::vector<uint8_t>& compressed, size_t originalSize) {
        if (compressed.empty()) return {};
        
        z_stream strm = {};
        strm.zalloc = Z_NULL;
        strm.zfree = Z_NULL;
        strm.opaque = Z_NULL;
        
        // 15 = max window bits, +16 = expect gzip header
        int ret = inflateInit2(&strm, 15 + 16);
        if (ret != Z_OK) {
            return {};
        }
        
        std::vector<uint8_t> decompressed(originalSize);
        
        strm.next_in = const_cast<Bytef*>(compressed.data());
        strm.avail_in = static_cast<uInt>(compressed.size());
        strm.next_out = decompressed.data();
        strm.avail_out = static_cast<uInt>(decompressed.size());
        
        ret = inflate(&strm, Z_FINISH);
        
        if (ret != Z_STREAM_END) {
            inflateEnd(&strm);
            return {};
        }
        
        decompressed.resize(strm.total_out);
        inflateEnd(&strm);
        
        return decompressed;
    }
};

#endif // GZIP_COMPRESSOR_H
