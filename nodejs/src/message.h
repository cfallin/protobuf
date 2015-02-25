#ifndef __PROTOBUF_NODEJS_SRC_MESSAGE_H__
#define __PROTOBUF_NODEJS_SRC_MESSAGE_H__

#include <nan.h>
#include "defs.h"
#include "util.h"
#include "jsobject.h"

namespace protobuf_js {

// This is called "ProtoMessage" because v8 has a class named v8::Message.
class ProtoMessage : public JSObject {
 public:
  JS_OBJECT(ProtoMessage);

  static void Init(v8::Handle<v8::Object> exports);

  static v8::Handle<v8::Function> MakeConstructor(v8::Local<v8::Object> descriptor);

  // Check the type of, and convert to canonical form if necessary, a single
  // element: the value of a singular field, or one element of a repeated field.
  static v8::Handle<v8::Value> CheckConvertElement(
      upb_fieldtype_t type, Descriptor* submsg, v8::Local<v8::Value> value,
      bool allow_null, bool allow_copy);

  // Check the type of, and convert to canonical form if necessary, the value of
  // a field: either a singular element or a repeated field object.
  //
  // If |allow_copy| is true, the check additionally allows conversions that
  // copy (i.e., no longer refer to) the original object: for example,
  // converting a regular JS array to a RepeatedField, as long as all elements
  // have the correct type.
  static v8::Handle<v8::Value> CheckField(
      FieldDescriptor* desc, v8::Local<v8::Value> value,
      bool allow_copy, bool allow_null);

  // Create a new default value for an element (singular field, or one element
  // of a repeated field) of the given type.
  static v8::Handle<v8::Value> NewElement(upb_fieldtype_t type);

  // Create a new value for a message field.
  static v8::Handle<v8::Value> NewField(FieldDescriptor* desc);

  // Get the human-readable string form of an element.
  static std::string ElementString(upb_fieldtype_t type,
                                   v8::Handle<v8::Object> type_desc,
                                   v8::Handle<v8::Value> value);

  Descriptor* desc() const { return desc_; }

 private:
  friend class Descriptor;

  ProtoMessage(Descriptor* desc, v8::Local<v8::Object> descobj);
  ~ProtoMessage()  {}

  // Methods.
  static NAN_METHOD(New);
  static NAN_METHOD(ToString);

  // Named property (message field) setters/getters.
  static NAN_PROPERTY_GETTER(MsgFieldGetter);
  bool DoFieldSet(v8::Local<v8::Object> this_,
                  v8::Local<v8::String> property,
                  v8::Local<v8::Value> value,
                  bool allow_copy);
  static NAN_PROPERTY_SETTER(MsgFieldSetter);
  static NAN_PROPERTY_ENUMERATOR(MsgFieldEnumerator);

  // Helpers.
  void InitFields(v8::Local<v8::Object> thisobj);
  bool HandleCtorArgs(_NAN_METHOD_ARGS_TYPE args);
  bool HandleCtorKeyValue(v8::Local<v8::Object> this_,
                          v8::Local<v8::Value> key,
                          v8::Local<v8::Value> value);

  // Data.

  // Note that the field values themselves are stored in 'internal fields' as
  // per V8. Unlike the Ruby proto3 extension, we choose not to manually manage
  // memory here in order to remain somewhat simpler -- the interactions with
  // V8's copying GC and reference indirection are sort of wonky so we'd rather
  // use the officially sanctioned means to store values.

  // We hold both the JS-side and C++-side references to Descriptor directly
  // here. This is to avoid the Persistent deref (through the V8-internal
  // storage slot) and the unwrapping cost at every field access. If the memory
  // overhead becomes too high, we could potentially keep only desc_js_.
  v8::Persistent<v8::Object> desc_js_;
  Descriptor* desc_;
};

}  // namespace protobuf_js

#endif  // __PROTOBUF_NODEJS_SRC_MESSAGE_H__
