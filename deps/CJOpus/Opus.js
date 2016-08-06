var Module = require('./CJOpus.js');
Object.defineProperty(Module, '_name', { value: "CJOpus"});

Module.OpusEncoder.prototype.encode = function(buffer) {
	var bufferBytes, bufferPtr;
	var eHeap;
	var outputPtr, output, len;
	var returnBuffer;
	
	buffer = new Uint16Array(buffer);
	bufferBytes = buffer.byteLength;
	bufferPtr = Module._malloc(bufferBytes);
	
	eHeap = new Uint8Array( Module.HEAPU8.buffer, bufferPtr, bufferBytes );
	eHeap.set( new Uint8Array(buffer.buffer) );
	
	outputPtr = Module._malloc( this.MAX_DATA_BYTES );
	output = new Uint8Array( Module.HEAPU8.buffer, outputPtr, this.MAX_DATA_BYTES );
	len = this._encode( eHeap.byteOffset, buffer.length, output.byteOffset );
	
	returnBuffer = output.slice(0, len);
	
	Module._free(bufferPtr);
	Module._free(outputPtr);
	
	return returnBuffer;
}

module.exports = Module;
