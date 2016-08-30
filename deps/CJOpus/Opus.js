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
Opus.OpusEncoder        = OpusEncoder;

var APPLICATION_CODES = Object.keys(Opus.APPLICATIONS).map(function(a) { return Opus.APPLICATIONS[a]; });
var ERROR_CODES = Object.keys(Opus.ERRORS).map(function(e) { return Opus.ERRORS[e]; });

function OpusEncoder(sample_rate, channels, application) {
    if (Opus.CHANNELS.indexOf(channels) < 0)        channels = 2;
    if (Opus.SAMPLE_RATES.indexOf(sample_rate) < 0) sample_rate = 48000;
    if (APPLICATION_CODES.indexOf(application) < 0) application = Opus.APPLICATIONS.AUDIO;

    this.encoder = Module._create_encoder_and_decoder(sample_rate, channels, application);

    var encoderError = Module._get_encoder_error(this.encoder);
    var decoderError = Module._get_decoder_error(this.encoder);

    if (encoderError || decoderError) {
        throw new OpusError( encoderError || decoderError );
    }

    this.channels = channels;

    //Is this correct?
    this.encodeFrameSize = sample_rate / 50;

    // --Encoding--
    this.pcmOffset     = Module._get_in_pcm_offset(this.encoder);
    this.encodedOffset = Module._get_encoded_offset(this.encoder);

    // --Decoding--
    this.opusOffset    = Module._get_in_opus_offset(this.encoder);
    this.decodedOffset = Module._get_decoded_little_endian_offset(this.encoder); 
}

OpusEncoder.prototype.encode = function( PCM ) {
    if ( !isExpectedType(PCM) ) {
        throw new TypeError( Object.prototype.toString.call(PCM) + " is not a valid type (Buffer, TypedArray, Array)");
    }

    Module.HEAPU8.set( PCM, this.pcmOffset );

    var length = Module._encode(this.encoder, PCM.length, this.encodeFrameSize);

    if (length < 0) throw new OpusError(length);

    return Module.HEAPU8.slice( this.encodedOffset, this.encodedOffset + length );
}

OpusEncoder.prototype.decode = function( OPUS ) {
    if ( !isExpectedType(OPUS) ) {
        throw new TypeError( Object.prototype.toString.call(OPUS) + " is not a valid type (Buffer, TypedArray, Array)");
    }

    Module.HEAPU8.set( OPUS, this.opusOffset );

    var frameSize = Module._decode( this.encoder, OPUS.length );

    if (frameSize < 0) throw new OpusError(frameSize);

    return Module.HEAP16.slice( this.decodedOffset / 2, (this.decodedOffset /2) + (frameSize * 2 * this.channels) );
}

OpusEncoder.prototype.encodeUnsafe = function( PCM ) {
    Module.HEAPU8.set( PCM, this.pcmOffset );
    return Module.HEAPU8.subarray(
        this.encodedOffset, 
        this.encodedOffset + Module._encode(
            this.encoder, 
            PCM.length, 
            this.encodeFrameSize
        )
    );
}

OpusEncoder.prototype.decodeUnsafe = function( OPUS ) {
    Module.HEAPU8.set( OPUS, this.opusOffset );
    return Module.HEAP16.subarray(
        this.decodedOffset / 2,
        (this.decodedOffset / 2) +
            (Module._decode(
                this.encoder,
                OPUS.length
            ) * 2 * this.channels)
    );
}

OpusEncoder.prototype.destroy = function() {
    Module._destroy_encoder(this.encoder);
}

function OpusError(code) {
    var error = new Error(Object.keys(Opus.ERRORS)[ERROR_CODES.indexOf(code)]);
    error.code = code;
    return error;
}

function isExpectedType(t) {
    return t instanceof Buffer || ArrayBuffer.isView(t) || Array.isArray(t);
}

module.exports = Opus;
