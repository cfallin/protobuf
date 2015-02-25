// ----------- local helpers -------------

function readonlyList(l) {
  var frozen = [];
  for (var i = 0; i < l.length; i++) {
    frozen.push(l[i]);
  }
  Object.freeze(frozen);
  return frozen;
}

function isInstance(obj, klass) {
  return obj.__proto__ === klass.prototype;
}

// ----------- validators -------------

// Combinator that converts a boolean-returning validator to an
// exception-throwing validator.
function checkThrow(validator, errmsg) {
  return function(value) {
    if (!validator(value)) {
      throw new Error(errmsg);
    }
  }
}

// Generic validator factory that creates an enum validator.
function enumValidator(minval, maxval) {
  return function(value) {
    return value == Math.floor(value) &&
           value >= -0x80000000 && value <= 0x7fffffff &&
           value >= minval && value <= maxval;
  }
}

// Validates a field name or a single component of a message/enum name.
function validateName(n) {
  return n.match(/^[_a-zA-Z][_a-zA-Z0-9]*$/);
}

// Validates a message or enum type name.
function validateTypeName(n) {
  var parts = n.split(".");
  if (parts.length == 0) {
    return false;
  }
  for (var i = 0; i < parts.length; i++) {
    if (!validateName(parts[i])) {
      return false;
    }
  }
  return true;
}

// Define throwing versions of name validators.
validateNameThrow = checkThrow(validateName, "Invalid name");
validateTypeNameThrow = checkThrow(validateTypeName, "Invalid name");

// Define validators for field types and labels.
validateFieldType = enumValidator(1, 11);
validateFieldTypeThrow = checkThrow(validateFieldType,
                                    "Invalid field type");
validateFieldLabel = function(val) {
  // No 'REQUIRED' -- proto2 not supported.
  return val == exports.FieldDescriptor.LABEL_OPTIONAL ||
         val == exports.FieldDescriptor.LABEL_REPEATED;
}
validateFieldLabelThrow = checkThrow(validateFieldLabel,
                                     "Invalid field label");

validateFieldNumber = enumValidator(1, (1 << 29) - 1);
validateFieldNumberThrow = checkThrow(validateFieldNumber,
                                      "Invalidate field number");

validateEnumValue = enumValidator(-0x80000000, 0x7fffffff);
validateEnumValueThrow = checkThrow(validateEnumValue,
                                    "Invalid enum value");

function checkMut(obj) {
  if (Object.isFrozen(obj)) {
    throw new Error("Cannot change frozen object");
  }
}

function checkList(obj) {
  if (!isInstance(obj, Array)) {
    throw new Error("Expected Array");
  }
}

// Helper: define an object property with a validator and that respects 'frozen'
// status.

function defineProp(obj, name, validator, default_value) {
  Object.defineProperty(obj, name, {
    get: function() { return this['_' + name]; },
    set: function(value) {
      checkMut(this);
      validator(value);
      this['_' + name] = value;
    }
  });

  if (default_value !== undefined) {
    obj[name] = default_value;
  }
}

function defineROProp(obj, name) {
  Object.defineProperty(obj, name, {
    get: function() { return this['_' + name]; },
    set: function() {
      throw new Error("Attempt to set a read-only property");
    }
  });
}

function defineROListProp(obj, name) {
  Object.defineProperty(obj, name, {
    get: function() { return readonlyList(this['_' + name]); },
    set: function() {
      throw new Error("Attempt to set a read-only property");
    }
  });
}

// ----------- Descriptor -------------

exports.Descriptor = function(name, fields, oneofs, is_mapentry) {
  // Optional arguments.
  if (arguments.length < 4) {
    is_mapentry = false;
  }
  if (arguments.length < 3) {
    oneofs = [];
  }
  if (arguments.length < 2) {
    fields = [];
  }

  this._name = "";
  this._msgclass = null;
  this._pool = null;
  this._fields = [];
  this._fieldmap = {};
  this._fieldNumMap = {};
  this._oneofs = [];
  this._oneofmap = {};
  this._is_mapentry = is_mapentry;

  defineROListProp(this, "fields");
  defineROListProp(this, "oneofs");
  defineProp(this, "name", validateTypeNameThrow, name);

  checkList(oneofs);
  for (var i = 0; i < oneofs.length; i++) {
    this.addOneof(oneofs[i]);
  }
  checkList(fields);
  for (var i = 0; i < fields.length; i++) {
    this.addField(fields[i]);
  }
}

exports.Descriptor.prototype.findFieldByName = function(name) {
  return this._fieldmap[name];
}

exports.Descriptor.prototype.findFieldByNumber = function(number) {
  return this._fieldNumMap[number];
}

exports.Descriptor.prototype.findOneof = function(name) {
  return this._oneofmap[name];
}

exports.Descriptor.prototype.addField = function(field) {
  checkMut(this);
  this._checkFieldConflict(field);
  this._fieldmap[field.name] = field;
  this._fieldNumMap[field.number] = field;
  this._fields.push(field);
  field._descriptor = this;
  return field;
}

exports.Descriptor.prototype.addOneof = function(oneof) {
  checkMut(this);
  this._checkOneofConflict(oneof);
  for (var i = 0; i < oneof._fields.length; i++) {
    this._checkFieldConflict(oneof._fields[i]);
  }

  this._oneofmap[oneof.name] = oneof;
  this._oneofs.push(oneof);
  for (var i = 0; i < oneof._fields.length; i++) {
    this.addField(oneof._fields[i]);
  }
  oneof._descriptor = this;
  return oneof;
}

exports.Descriptor.prototype._checkFieldConflict = function(field) {
  validateNameThrow(field.name);
  validateFieldNumberThrow(field.number);
  if (this._fieldmap[field.name] !== undefined) {
    throw new Error("Duplicate field name: " + field.name);
  }
  if (this._fieldNumMap[field.number] !== undefined) {
    throw new Error("Duplicate field number: " + field.number);
  }
}

exports.Descriptor.prototype._checkOneofConflict = function(oneof) {
  validateNameThrow(oneof.name);
  if (this._oneofmap[oneof.name] !== undefined) {
    throw new Error("Duplicate oneof name: " + oneof.name);
  }
}

exports.Descriptor.prototype.toString = function() {
  return "[Descriptor: " + this._name + "]";
}

// ----------- FieldDescriptor -------------

exports.FieldDescriptor = function(obj) {
  if (arguments.length < 1) {
    obj = {};
  }

  this._name = "";
  this._type = 0;
  this._label = 0;
  this._number = 0;
  this._subtype_name = 0;
  this._subtype = undefined;
  this._descriptor = null;
  this._oneof = null;

  defineProp(this, "name", validateNameThrow, obj.name);
  defineProp(this, "type", validateFieldTypeThrow, obj.type);
  defineProp(this, "label", validateFieldLabelThrow, obj.label);
  defineProp(this, "number", validateFieldNumberThrow, obj.number);
  defineProp(this, "subtype_name", validateTypeNameThrow, obj.subtype_name);

  Object.defineProperty(this, "subtype", {
    get: function() {
      if (!Object.isFrozen(this)) {
        throw new Error(
            "Cannot access subtype until after field is added to pool");
      }
      return this._subtype;
    },
    set: function() {
      throw new Error("subtype is a read-only property");
    }
  });

  defineROProp(this, "descriptor");
  defineROProp(this, "oneof");
}

exports.FieldDescriptor.prototype.toString = function() {
  return "[FieldDescriptor: " + this._name + "]";
}

exports.FieldDescriptor.TYPE_FLOAT   = 1;
exports.FieldDescriptor.TYPE_DOUBLE  = 2;
exports.FieldDescriptor.TYPE_BOOL    = 3;
exports.FieldDescriptor.TYPE_STRING  = 4;
exports.FieldDescriptor.TYPE_BYTES   = 5;
exports.FieldDescriptor.TYPE_MESSAGE = 6;
exports.FieldDescriptor.TYPE_ENUM    = 7;
exports.FieldDescriptor.TYPE_INT32   = 8;
exports.FieldDescriptor.TYPE_UINT32  = 9;
exports.FieldDescriptor.TYPE_INT64   = 10;
exports.FieldDescriptor.TYPE_UINT64  = 11;

exports.FieldDescriptor.LABEL_OPTIONAL = 1;
exports.FieldDescriptor.LABEL_REQUIRED = 2;
exports.FieldDescriptor.LABEL_REPEATED = 3;

// ----------- OneofDescriptor -------------

exports.OneofDescriptor = function(name, fields) {
  if (arguments.length < 2) {
    fields = [];
  }

  this._name = "";
  this._fields = [];
  this._fieldmap = {};
  this._fieldNumMap = {};
  this._descriptor = null;

  defineProp(this, "name", validateNameThrow, name);
  defineROListProp(this, "fields");
  defineROProp(this, "descriptor");

  checkList(fields);
  for (var i = 0; i < fields.length; i++) {
    this.addField(fields[i]);
  }
}

exports.OneofDescriptor.prototype.findFieldByName = function(name) {
  return this._fieldmap[name];
}

exports.OneofDescriptor.prototype.findFieldByNumber = function(number) {
  return this._fieldNumMap[number];
}

exports.OneofDescriptor.prototype.addField = function(field) {
  checkMut(this);

  var add_to_desc = false;
  if (this._descriptor !== null &&
      field.descriptor !== this._descriptor) {
    add_to_desc = true;
    this._descriptor._checkFieldConflict(field);
  }

  this._checkFieldConflict(field);
  this._fieldmap[field.name] = field;
  this._fieldNumMap[field.number] = field;
  this._fields.push(field);
  field._oneof = this;
  if (add_to_desc) {
    this._descriptor.addField(field);
  }
  return field;
}

exports.OneofDescriptor.prototype._checkFieldConflict = function(field) {
  validateNameThrow(field.name);
  validateFieldNumberThrow(field.number);
  if (field._label !== exports.FieldDescriptor.LABEL_OPTIONAL) {
    throw new Error("Can only add an optional field to a oneof");
  }
  if (field._oneof !== null) {
    throw new Error("Field is already a member of a oneof");
  }
  if (this._fieldmap[field.name] !== undefined) {
    throw new Error("Duplicate field name: " + field.name);
  }
  if (this._fieldNumMap[field.number] !== undefined) {
    throw new Error("Duplicate field number: " + field.number);
  }
}

exports.OneofDescriptor.prototype.toString = function() {
  return "[OneofDescriptor: " + this._name + "]";
}

// ----------- EnumDescriptor -------------

exports.EnumDescriptor = function(name) {
  this._name = "";
  this._keys = [];
  this._values = [];
  this._map = {};
  this._reverse_map = {};

  defineProp(this, "name", validateTypeNameThrow, name);
  defineROListProp(this, "keys");
  defineROListProp(this, "values");

  if (arguments.length > 0 &&
      (arguments.length & 1) != 1) {
    throw new Error(
        "EnumDescriptor constructor has mismatched key/value pairs");
  }
  for (var i = 1; (i + 1) < arguments.length; i += 2) {
    var key = arguments[i];
    var value = arguments[i + 1];
    this.add(key, value);
  }
}

exports.EnumDescriptor.prototype.add = function(key, value) {
  checkMut(this);
  this._checkConflict(key, value);
  this._map[key] = value;
  this._reverse_map[value] = key;
  this._keys.push(key);
  this._values.push(value);
  // Set up the constant itself.
  this[key] = value;
  return key;
}

exports.EnumDescriptor.prototype.findByName = function(key) {
  return this._map[key];
}

exports.EnumDescriptor.prototype.findByValue = function(value) {
  return this._reverse_map[value];
}

exports.EnumDescriptor.prototype._checkConflict = function(key, value) {
  validateNameThrow(key);
  validateEnumValueThrow(value);
  if (this._map[key] !== undefined) {
    throw new Error("Duplicate enum key name");
  }
  if (this._reverse_map[value] !== undefined) {
    throw new Error("Duplicate enum value name");
  }
}

exports.EnumDescriptor.prototype.toString = function() {
  return "[EnumDescriptor: " + this._name + "]";
}

// ----------- DescriptorPool -------------

exports.DescriptorPool = function() {
  this._descmap = {};
  this._descriptors = [];
  this._enums = [];
  defineROListProp(this, "descriptors");
  defineROListProp(this, "enums");
}

exports.DescriptorPool.prototype.add = function(descs) {
  checkList(descs);
  // Validate each descriptor individually to ensure all necessary information
  // is present.
  for (var i = 0; i < descs.length; i++) {
    this._validateObj(descs[i]);
  }

  // Validate type-name references.
  var current_names = {};
  for (var i = 0; i < descs.length; i++) {
    current_names[descs[i].name] = true;
  }
  for (var i = 0; i < descs.length; i++) {
    this._validateNameRefs(descs[i], this._descmap, current_names);
  }

  // Add descriptors and set pool backpointers.
  for (var i = 0; i < descs.length; i++) {
    this._addDesc(descs[i]);
  }

  // Resolve type references.
  for (var i = 0; i < descs.length; i++) {
    this._resolveNameRefs(descs[i]);
  }

  // Freeze descriptor objects and their field and oneof subobjects.
  for (var i = 0; i < descs.length; i++) {
    this._freezeDesc(descs[i]);
  }
}

exports.DescriptorPool.prototype._validateObj = function(obj) {
  if (isInstance(obj, exports.Descriptor)) {
    this._validateDesc(obj);
  } else if (isInstance(obj, exports.EnumDescriptor)) {
    this._validateEnumDesc(obj);
  } else {
    throw new Error("Object " + obj + " is not a Descriptor or " +
                    "EnumDescriptor instance");
  }
}

exports.DescriptorPool.prototype._validateDesc = function(desc) {
  validateTypeNameThrow(desc.name);
  for (var i = 0; i < desc._fields.length; i++) {
    this._validateField(desc._fields[i], desc);
  }
  for (var i = 0; i < desc._oneofs.length; i++) {
    this._validateOneof(desc._oneofs[i], desc);
  }
}

exports.DescriptorPool.prototype._validateField = function(field, desc) {
  validateNameThrow(field.name);
  validateFieldNumberThrow(field.number);
  validateFieldLabelThrow(field.label);
  validateFieldTypeThrow(field.type);
  // User may have mucked with internal data structures -- check backpointer.
  if (field._descriptor !== desc) {
    throw new Error("Field backpointer not properly set to descriptor");
  }
  if (desc.findFieldByName(field.name) !== field) {
    throw new Error("Field name was changed after adding to descriptor");
  }
  if (desc.findFieldByNumber(field.number) !== field) {
    throw new Error("Field number was changed after adding to descriptor");
  }
}

exports.DescriptorPool.prototype._validateOneof = function(oneof, desc) {
  validateNameThrow(oneof.name);
  if (oneof._descriptor !==  desc) {
    throw new Error("Oneof backpointer not properly set to descriptor");
  }
  if (desc.findOneof(oneof.name) !== oneof) {
    throw new Error("Oneof name was changed after adding to descriptor");
  }
  // Descriptor validation will already check most of the oneof's fields'
  // properties -- we only need to check that they're properly set up as part of
  // the oneof and that they are actually added to the descriptor as well.
  for (var i = 0; i < oneof._fields.length; i++) {
    var field = oneof._fields[i];
    if (field._oneof !== oneof) {
      throw new Error("Field oneof backpointer was not properly set to oneof");
    }
    if (field._descriptor !== desc) {
      throw new Error("Field descriptor backpointer was not properly set to " +
                      "descriptor");
    }
    if (oneof.findFieldByName(field.name) !== field) {
      throw new Error("Field name changed after adding to oneof");
    }
    if (oneof.findFieldByNumber(field.number) !== field) {
      throw new Error("Field number changed after adding to oneof");
    }
  }
}

exports.DescriptorPool.prototype._validateEnumDesc = function(enumdesc) {
  validateTypeNameThrow(enumdesc.name);
  for (var i = 0; i < enumdesc._keys.length; i++) {
    var key = enumdesc._keys[i];
    var value = enumdesc._map[key];
    if (key !== enumdesc._reverse_map[value]) {
      throw new Error("Enum descriptor maps not set up properly");
    }
    validateNameThrow(key);
    validateEnumValueThrow(value);
  }
}

exports.DescriptorPool.prototype._validateNameRefs =
    function(desc, poolmap, addmap) {
  if (isInstance(desc, exports.Descriptor)) {
    for (var i = 0; i < desc._fields.length; i++) {
      var field = desc._fields[i];
      if (field._type === exports.FieldDescriptor.TYPE_MESSAGE ||
          field._type === exports.FieldDescriptor.TYPE_ENUM) {
        validateTypeNameThrow(field._subtype_name);
        if (poolmap[field._subtype_name] === undefined &&
            addmap[field._subtype_name] === undefined) {
          throw new Error("Could not resolve type reference: " +
                          field._subtype_name);
        }
      }
    }
  }
}

exports.DescriptorPool.prototype._addDesc = function(desc) {
  this._descmap[desc.name] = desc;
  if (isInstance(desc, exports.Descriptor)) {
    this._descriptors.push(desc);
  } else if (isInstance(desc, exports.EnumDescriptor)) {
    this._enums.push(desc);
  }
  desc._pool = this;
}

exports.DescriptorPool.prototype._resolveNameRefs = function(desc) {
  if (isInstance(desc, exports.Descriptor)) {
    for (var i = 0; i < desc._fields.length; i++) {
      var field = desc._fields[i];
      if (field._type === exports.FieldDescriptor.TYPE_MESSAGE ||
          field._type === exports.FieldDescriptor.TYPE_ENUM) {
        field._subtype = this._descmap[field._subtype_name];
      }
    }
  }
}

exports.DescriptorPool.prototype._freezeDesc = function(desc) {
  if (isInstance(desc, exports.Descriptor)) {
    for (var i = 0; i < desc._fields.length; i++) {
      var field = desc._fields[i];
      Object.freeze(field);
    }
    for (var i = 0; i < desc._oneofs.length; i++) {
      var oneof = desc._oneofs[i];
      Object.freeze(oneof);
    }
  }
  Object.freeze(desc);
}

exports.DescriptorPool.prototype.lookup = function(name) {
  return this._descmap[name];
}

exports.DescriptorPool.prototype.toString = function() {
  return "[DescriptorPool]";
}

exports.DescriptorPool.generatedPool = new exports.DescriptorPool();
