#include <emscripten.h>
#include "opus-1.1.3/include/opus.h"

EMSCRIPTEN_KEEPALIVE
OpusEncoder* create_encoder(opus_int32 sample_rate, int channels, int application, int* encoder_error) {
    return opus_encoder_create( sample_rate, channels, application, encoder_error );
}

EMSCRIPTEN_KEEPALIVE
OpusDecoder* create_decoder(opus_int32 sample_rate, int channels, int* decoder_error) {
    return opus_decoder_create( sample_rate, channels, decoder_error );
} 

EMSCRIPTEN_KEEPALIVE
int encode(OpusEncoder* encoder, opus_int16* pcm, int frame_size, unsigned char* out, int max_bytes) {
    return opus_encode( encoder, pcm, frame_size, out, max_bytes );
}

EMSCRIPTEN_KEEPALIVE
int decode(OpusDecoder* decoder, unsigned char* opus, int length, opus_int16* out, int frame_size) {
    return opus_decode( decoder, opus, length, out, frame_size, 0);
}