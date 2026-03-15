#ifndef GZIP_COMPRESSOR_H
#define GZIP_COMPRESSOR_H

#include <vector>
#include <fstream>
#include <cstdint>
#include <string>
#include <zlib.h>

class GzipCompressor {
public:
    static std::vector<uint8_t> CompressFile(const std::string& filePath, size_t& originalSize) {
        std::vector<uint8_t> result;
        
        std::ifstream file(filePath, std::ios::binary | std::ios::ate);
        if (!file.is_open()) return result;
        
        originalSize = static_cast<size_t>(file.tellg());
        file.seekg(0, std::ios::beg);
        
        std::vector<uint8_t> fileData(originalSize);
        if (!file.read(reinterpret_cast<char*>(fileData.data()), originalSize)) {
            return result;
        }
        file.close();
        
        result = CompressToGzip(fileData);
        
        return result;
    }
    
    static std::vector<uint8_t> CompressToGzip(const std::vector<uint8_t>& data) {
        if (data.empty()) return {};
        
        
        z_stream strm = {};
        strm.zalloc = Z_NULL;
        strm.zfree = Z_NULL;
        strm.opaque = Z_NULL;
        
        int ret = deflateInit2(&strm, Z_BEST_SPEED, Z_DEFLATED, 15 + 16, 8, Z_DEFAULT_STRATEGY);
        if (ret != Z_OK) {
            return {};
        }
        
        size_t maxCompressed = deflateBound(&strm, static_cast<uLong>(data.size()));
        std::vector<uint8_t> compressed(maxCompressed);
        
        strm.next_in = const_cast<Bytef*>(data.data());
        strm.avail_in = static_cast<uInt>(data.size());
        
        strm.next_out = compressed.data();
        strm.avail_out = static_cast<uInt>(compressed.size());
        
        ret = deflate(&strm, Z_FINISH);
        
        if (ret != Z_STREAM_END) {
            deflateEnd(&strm);
            return {};
        }
        
        compressed.resize(strm.total_out);
        
        deflateEnd(&strm);
        return compressed;
    }
    
    static std::vector<uint8_t> DecompressGzip(const std::vector<uint8_t>& compressed, size_t originalSize) {
        if (compressed.empty()) return {};
        
        z_stream strm = {};
        strm.zalloc = Z_NULL;
        strm.zfree = Z_NULL;
        strm.opaque = Z_NULL;
        
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

#endif 
