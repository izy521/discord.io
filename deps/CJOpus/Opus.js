var Module = require('./CJOpus.js');
var Opus = {};

Opus.APPLICATIONS = {
    VOIP:               2048,
    AUDIO:              2049,
    RESTRICTED_LOWDELAY:2051
};
Opus.ERRORS = {
    OK:                  0,
    BAD_ARG:            -1,
    BUFFER_TOO_SMALL:   -2,
    INTERNAL_ERROR:     -3,
    INVALID_PACKET:     -4,
    UNIMPLEMENTED:      -5,
    INVALID_STATE:      -6,
    ALLOC_FAIL:         -7
};
Opus.SAMPLE_RATES       = [8000, 12000, 16000, 24000, 48000];
Opus.CHANNELS           = [1, 2];
Opus.MAX_FRAME_SIZE     = 5760;
Opus.MAX_INPUT_BYTES    = 3840;
Opus.MAX_OUTPUT_BYTES   = 4000;
Opus.OpusEncoder        = OpusEncoder;

var APPLICATION_CODES = Object.keys(Opus.APPLICATIONS).map(function(a) { return Opus.APPLICATIONS[a]; });
var ERROR_CODES = Object.keys(Opus.ERRORS).map(function(e) { return Opus.ERRORS[e]; });


function OpusEncoder(sample_rate, channels, application) {
    if (Opus.CHANNELS.indexOf(channels) < 0)        channels = 2;
    if (Opus.SAMPLE_RATES.indexOf(sample_rate) < 0) sample_rate = 48000;
    if (APPLICATION_CODES.indexOf(application) < 0) application = Opus.APPLICATIONS.AUDIO;

    var encoder_error_pointer = Module._malloc(4),
        encoder_error_code,
        encoder_error;
    var decoder_error_pointer = Module._malloc(4),
        decoder_error_code,
        decoder_error;

    this.encoder = Module._create_encoder(
        sample_rate, 
        channels,
        application,
        encoder_error_pointer
    );
    this.decoder = Module._create_decoder(
        sample_rate,
        channels,
        decoder_error_pointer
    );

    this.channels = channels;

    encoder_error_code = Module.getValue(encoder_error_pointer, 'i32');
    decoder_error_code = Module.getValue(decoder_error_pointer, 'i32');

    Module._free(encoder_error_pointer);
    Module._free(decoder_error_pointer);

    if (encoder_error_code || decoder_error_code) {
        return new Error( [Object.keys(Opus.ERRORS)[ERROR_CODES.indexOf( (encoder_error_code || decoder_error_code) )], error_code] );
    }

    /* --Encoding-- */

    this.inData = new Uint16Array(Opus.MAX_INPUT_BYTES);
    this.inDataBytes = this.inData.byteLength;
    this.inDataPtr = Module._malloc(this.inDataBytes);

    this.pcmHeap = new Uint16Array( Module.HEAPU16.buffer, this.inDataPtr, this.inDataBytes );

    this.outDataPtr = Module._malloc(Opus.MAX_OUTPUT_BYTES);
    this.outData = new Uint8Array( Module.HEAPU8.buffer, this.outDataPtr, Opus.MAX_OUTPUT_BYTES );

    /* --Decoding-- */

    this.decodeInDataPtr = Module._malloc(Opus.MAX_OUTPUT_BYTES);
    this.opusHeap = new Uint8Array( Module.HEAPU8.buffer, this.decodeInDataPtr, Opus.MAX_OUTPUT_BYTES );

    this.decodeOutDataPtr = Module._malloc(Opus.MAX_INPUT_BYTES);
    this.decodeOutData = new Uint16Array( Module.HEAPU16.buffer, this.decodeOutDataPtr, Opus.MAX_INPUT_BYTES );
    this.decodeResultData = new Uint16Array(Opus.MAX_INPUT_BYTES);
    
}

OpusEncoder.prototype.encode = function(PCM) {
    toBigEndian(PCM, this.inData);
    this.pcmHeap.set( this.inData.subarray(0, PCM.length) );
    return this.outData.slice(0, Module._encode( this.encoder, this.pcmHeap.byteOffset, 960, this.outData.byteOffset, Opus.MAX_OUTPUT_BYTES ) );
}

OpusEncoder.prototype.decode = function(OPUS) {
    this.opusHeap.set( OPUS );
    var frame_size = Module._decode( this.decoder, this.opusHeap.byteOffset, OPUS.length, this.decodeOutData.byteOffset, 960);
    toLittleEndian(this.decodeOutData, this.decodeResultData);
    return this.decodeResultData.slice(0, frame_size * 2 * this.channels);
}

OpusEncoder.prototype.destroy = function() {
    Module._free(this.inDataPtr);
    Module._free(this.outDataPtr);
    //Destroy encoder, loser.
}

function toBigEndian(inBuffer, outBuffer) {
    var i = inBuffer.length;
    for (;i--;) {
        outBuffer[i] = inBuffer[2*i+1]<<8|inBuffer[2*i];
    }
}

function toLittleEndian(inBuffer, outBuffer) {
    var i = inBuffer.length;
    for (;i--;) {
        outBuffer[2*i]=inBuffer[i]&0xFF;
        outBuffer[2*i+1]=(inBuffer[i]>>8)&0xFF;
    }
}

module.exports = Opus;