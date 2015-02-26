function MakeClass(is_signed, name) {
  function u32(val) {
    if (val < 0) {
      val += 0x100000000;
    }
    return val;
  }

  // Multiply a [hi, lo] 64-bit value by 10 and add a digit.
  function ParseValAddDigit(accum, digit) {
    var hi = accum[0];
    var lo = accum[1];
    hi *= 10;
    lo *= 10;
    lo += digit;
    // Carry high part of multiplication result.
    hi += Math.floor(lo / 0x100000000);
    lo = u32(lo & 0xffffffff);
    return [hi, lo];
  }

  // Compute the twos-complement negative of a value.
  function Negative(pair) {
    var hi = pair[0];
    var lo = pair[1];
    // Twos-complement: invert bits and add 1.
    lo = u32(lo ^ 0xffffffff);
    hi = u32(hi ^ 0xffffffff);
    lo++;
    if (lo > 0xffffffff) {
      // Carry.
      lo -= 0x100000000;
      hi++;
    }
    return [hi, lo];
  }

  // Divide a 64-bit value by a 32-bit value. Assumes that both values are
  // unsigned (positive). Returns [[hi, lo], remainder].
  function DivMod(pair, dividend) {
    var hi = pair[0];
    var lo = pair[1];
    var hi_quotient = Math.floor(hi / dividend);
    var hi_remainder = hi - (hi_quotient * dividend);
    lo += hi_remainder * 0x100000000;
    var lo_quotient = Math.floor(lo / dividend);
    var lo_remainder = lo - (lo_quotient * dividend);
    return [[hi_quotient, lo_quotient], lo_remainder];
  }

  // Parse a decimal string to a 64-bit value.
  function ParseValString(s) {
    var sign = 0;
    var hi = 0;
    var lo = 0;
    for (var i = 0; i < s.length; i++) {
      if (s[i] == ' ') {
        continue;
      }
      if (s[i] == '+') {
        if (sign != 0) {
          throw new Error("Number parse error: '+' occurs in unexpected " +
                          "position");
        }
        sign = +1;
      }
      if (s[i] == '-') {
        if (sign != 0) {
          throw new Error("Number parse error: '-' occurs in unexpected " +
                          "position");
        }
        if (!is_signed) {
          throw new Error("Negative number given to unsigned int64 type");
        }
        sign = -1;
      }
      if (s[i] >= '0' && s[i] <= '9') {
        if (sign == 0) {
          sign = +1;
        }
        var digit = parseInt(s[i]);
        var ret = ParseValAddDigit([hi, lo], digit);
        hi = ret[0];
        lo = ret[1];
        if (hi > 0xffffffff) {
          throw new Error("Number parse error: 64-bit overflow");
        }
      }
    }

    if (sign == -1) {
      var parts = Negative([hi, lo]);
      hi = parts[0];
      lo = parts[1];
    }

    return [hi, lo];
  }

  // Takes a string, double, or int32 and returns [hi, lo] parts. This accepts
  // all types accepted by (i) the constructor to the class and (ii) the join()
  // function for hi and lo parts.
  function parseVal(value) {
    if (typeof value === "string") {
      return ParseValString(value);
    } else if (typeof value == "number") {
      if (Math.floor(value) != value) {
        throw new Error("Non-integer number in Int64/UInt64 constructor");
      }
      if (is_signed) {
        if ((value >= 0x8000000000000000) || (value < -0x8000000000000000)) {
          throw new Error("Overflow/underflow in Int64 constructor");
        }
      } else {
        if ((value >= 0x10000000000000000) || (value < 0)) {
          throw new Error("Overflow/underflow in UInt64 constructor");
        }
      }
      var negative = false;
      if (value < 0) {
        negative = true;
        value = -value;
      }
      var hi = Math.floor(value / 0x100000000);
      var lo = value & 0xffffffff;
      if (lo < 0) {
        lo += 0x100000000; // bitwise and interprets the result as *signed*.
      }
      return negative ? Negative([hi, lo]) : [hi, lo];
    } else if (value._hi !== undefined && value._lo !== undefined) {
      if (value._signed && !is_signed ||
          !value._signed && is_signed) {
        if (value._hi >= 0x80000000) {
          // On signed-to-unsigned, the upper half (0x8000_0000_0000_0000 up) is
          // negative and so is an underflow. On unsigned-to-signed, it's beyond
          // the positive range of a signed value so is an overflow.
          throw new Error("Underflow/overflow on signed/unsigned conversion");
        }
      }
      return [value._hi, value._lo];
    } else {
      throw new Error("Unknown type in Int64/UInt64 constructor");
    }
  }

  // Convert a [hi, lo] pair to a decimal string.
  function ToString(pair, signed) {
    var sign = '';
    if (signed && pair[0] >= 0x80000000) {
      sign = '-';
      pair = Negative(pair);
    }
    var hi = pair[0];
    var lo = pair[1];

    var digits = '';
    while (hi > 0 || lo > 0) {
      var result = DivMod([hi, lo], 10);
      hi = result[0][0];
      lo = result[0][1];
      var digit = result[1];
      digits = digit.toString() + digits;
    }
    if (digits == '') {
      digits = '0';
    }
    return sign + digits;
  }

  // Create the class itself.
  var klass = function(value) {
    this._signed = is_signed;
    this._hi = 0;
    this._lo = 0;
    if (arguments.length >= 1) {
      var parts = parseVal(value);
      this._hi = parts[0];
      this._lo = parts[1];
    }
  }

  klass.hi = function(obj) {
    return obj._hi;
  }
  klass.lo = function(obj) {
    return obj._lo;
  }
  klass.join = function(hi, lo) {
    var ret = new klass();
    var hiVal = parseVal(hi);
    var loVal = parseVal(lo);
    if (hiVal[0] !== 0 || loVal[0] !== 0) {
      throw new Error("High part of hi/lo 32-bit values are not zero");
    }
    ret._hi = hiVal[1];
    ret._lo = loVal[1];
    return ret;
  }
  klass.compare = function(a, b) {
    // Convert A and B to a 65-bit (-2^64, +2^64) space to allow uniform
    // comparison of signed and unsigned integers.
    var a_hi = a._hi;
    var a_lo = a._lo;
    var b_hi = b._hi;
    var b_lo = b._lo;
    if (a._signed && a_hi >= 0x80000000) {
      a_hi -= 0x100000000;
    }
    if (b._signed && b_hi >= 0x80000000) {
      b_hi -= 0x100000000;
    }

    if (a_hi == b_hi && a_lo == b_lo) {
      return 0;
    } else if (a_hi > b_hi || (a_hi == b_hi && a_lo > b_lo)) {
      return 1;
    } else {
      return -1;
    }
  }
  klass.prototype.toString = function() {
    return ToString([this._hi, this._lo], this._signed);
  }

  return klass;
}

exports.Int64 = MakeClass(true, "Int64");
exports.UInt64 = MakeClass(false, "UInt64");
