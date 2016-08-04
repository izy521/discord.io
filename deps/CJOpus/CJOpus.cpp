#include <emscripten/bind.h>

#include "opus-1.1.3/include/opus.h"

#define BITRATE 96000
#define FRAME_SIZE 960
#define APPLICATION OPUS_APPLICATION_AUDIO

using namespace emscripten;

class _Opus {
	private:
		//Right now, just trying to get this working with discord.io
		//Will allow actual settings when I make it a require-able module.
		static const opus_int32 _MAX_DATA_BYTES = 2000;
		unsigned char out[_MAX_DATA_BYTES];

		OpusEncoder* encoder;
		OpusDecoder* decoder;
	
	public:
		opus_int32 getMDB() const { return _MAX_DATA_BYTES; }
			
		_Opus( const opus_int32 SAMPLE_RATE, const int CHANNELS ) {
			int error, ctl_error;
			encoder = opus_encoder_create( SAMPLE_RATE, CHANNELS, APPLICATION, &error );

			//https://mf4.xiph.org/jenkins/view/opus/job/opus/ws/doc/html/group__opus__errorcodes.html
			//Handle Opus error, maybe someone with more C++ experience can see how to do this in accordance with C++ standards.
			if ( error != OPUS_OK ) {}

			ctl_error = opus_encoder_ctl( encoder, OPUS_SET_BITRATE(BITRATE) );
		}

		int _encode(const unsigned int input_buffer, const unsigned int len, unsigned int output_buffer) {
			const short* input = reinterpret_cast<const short*>(input_buffer);
			unsigned char* output = reinterpret_cast<unsigned char*>(output_buffer);
			opus_int16 pcm[len];

			//Convert from Little Endian
			for (unsigned int i=0; i<len; i++) {
				pcm[i] = input[2*i+1]<<8|input[2*i];
			}

			return opus_encode( encoder, pcm, FRAME_SIZE, output, _MAX_DATA_BYTES );
		}
	//len = this._encode( eHeap.byteOffset, buffer.length, output.byteOffset );

		//A bad previous attempt at returning an array.
		//Can't find out how to do that, looking through their docs.
		//Will have to wrap this in an actual JS class...
		/*val encode(const short *b, const unsigned int len) {
			//No clue how to find out the size of an array that's a pointer.
			short input[len];
			int e_len;

			//Convert from Little Endian
			for (unsigned int i=0; i<len; i++) {
				input[i] = b[2*i+1]<<8|b[2*i];
			}

			//Encode and get the length
			e_len = opus_encode( encoder, b, FRAME_SIZE, out, MAX_DATA_BYTES );

			//Create an array from that length
			//unsigned char r[e_len];
			val r = val::array();

			//Copy the data from the out array into the return array
			for (unsigned int o = e_len; o--;) {
				r.set(o, out[o]);
			}

			return r;
		}*/
};

EMSCRIPTEN_BINDINGS(CJOpus) {
	class_<_Opus>("_Opus")
		.constructor<opus_int32, int>()
		.property("MAX_DATA_BYTES", &_Opus::getMDB)
		.function("_encode", &_Opus::_encode, allow_raw_pointers())
		.function("_destroy", &_Opus::_destroy, allow_raw_pointers());
}