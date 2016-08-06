#include <emscripten/bind.h>

#include "opus-1.1.3/include/opus.h"

#define BITRATE 96000
#define FRAME_SIZE 960
#define APPLICATION OPUS_APPLICATION_AUDIO

using namespace emscripten;

class OpusEncoder {
	private:
		//Right now, just trying to get this working with discord.io
		//Will allow actual settings when I make it a require-able module.
		static const opus_int32 _MAX_DATA_BYTES = 2000;
		unsigned char out[_MAX_DATA_BYTES];

		OpusEncoder* encoder;
		OpusDecoder* decoder;
	
	public:
		opus_int32 getMDB() const { return _MAX_DATA_BYTES; }
			
		OpusEncoder( const opus_int32 SAMPLE_RATE, const int CHANNELS ) {
			int encoder_error, decoder_error, ctl_error;

			encoder = opus_encoder_create( SAMPLE_RATE, CHANNELS, APPLICATION, &encoder_error );
			decoder = opus_decoder_create( SAMPLE_RATE, CHANNELS, &decoder_error);
			
			//https://mf4.xiph.org/jenkins/view/opus/job/opus/ws/doc/html/group__opus__errorcodes.html
			//Handle Opus error, maybe someone with more C++ experience can see how to do this in accordance with C++ standards.
			if ( encoder_error != OPUS_OK ) {}
			if ( decoder_error != OPUS_OK ) {}

			ctl_error = opus_encoder_ctl( encoder, OPUS_SET_BITRATE( BITRATE ) );
		}
		~OpusEncoder() {
			opus_encoder_destroy( encoder );
			opus_decoder_destroy( decoder );
		}

		int _encode( const unsigned int input_buffer, const unsigned int len, unsigned int output_buffer ) {
			const short* input = reinterpret_cast<const short*>( input_buffer );
			unsigned char* output = reinterpret_cast<unsigned char*>( output_buffer );
			opus_int16 pcm[len];

			//Convert from Little Endian
			for ( unsigned int i=0; i<len; i++ ) {
				pcm[i] = input[2*i+1]<<8|input[2*i];
			}

			return opus_encode( encoder, pcm, FRAME_SIZE, output, _MAX_DATA_BYTES );
		}
		//TODO: Decode
};

EMSCRIPTEN_BINDINGS( CJOpus ) {
	class_<OpusEncoder>( "OpusEncoder" )
		.constructor<opus_int32, int>()
		.property( "MAX_DATA_BYTES", &OpusEncoder::getMDB )
		.function( "_encode", &OpusEncoder::_encode, allow_raw_pointers() );
}
