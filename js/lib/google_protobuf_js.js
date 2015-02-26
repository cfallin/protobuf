function submodule(submod, name) {
  for (var prop in submod) {
    exports[prop] = submod[prop];
  }
}

submodule(require('./google_protobuf_js/defs.js'));
submodule(require('./google_protobuf_js/int64.js'));
//submodule(require('./google_protobuf_js/rptfield'));
//submodule(require('./google_protobuf_js/map'));
//submodule(require('./google_protobuf_js/message'));
//submodule(require('./google_protobuf_js/encode_decode'));
