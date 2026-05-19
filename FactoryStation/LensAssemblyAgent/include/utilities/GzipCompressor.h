#ifndef GZIP_COMPRESSOR_H
#define GZIP_COMPRESSOR_H

#include <vector>
#include <fstream>
#include <cstdint>
#include <string>
#include <zlib.h>

class GzipCompressor {
public:

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
};

#endif 
