/**
 * @fileoverview
 * Non-extractive non-validating XML parser for JavaScript.
 * Originally based on article: http://www.xml.com/pub/a/2004/05/19/parsing.html
 * @author Valentin Alexeev
 */

/**
 * @class
 * Basic parser class. Library entrance point.
 */
function NEXMLParser() {

}

/**
 * Build document from XML string.
 * @param {String} inString string to parse
 * @type NEXMLDocument
 */
NEXMLParser.prototype.fromXmlString = function (inString) {
    return new NEXMLDocument(inString, this._buildTokenTable(inString));
}

/**
 * Build token table from input string.
 * IIRK the theory parser is close to O(n * log(n)) complexity.
 * Internally it is optimized both for memory allocation and processing power necessary.
 * Roughly: 10kb of RSS text takes 20ms on dual core 2.0GHz with FF3 and 20s on 292 BogoMIPS with Fresco.
 * @param {String} inXml XML string to parse
 * @type Array
 * @private
 */
NEXMLParser.prototype._buildTokenTable = function (inXml) {
    var BOOTSTRAP_LIMIT = 20;
    var EX_MSG = "malformed XML at position = ";
    // bootsrap - there is no easy way to predict how much tokens we will have
    var tokenTable = new Array(BOOTSTRAP_LIMIT);
    var curTokenStack = new Array(BOOTSTRAP_LIMIT);
    for (var i = 0; i < BOOTSTRAP_LIMIT; i++) {
        tokenTable[i] = new Array(5);
    }
    // parse
    var curToken, curChar, nextChar, token, addLength;
    var tokenTableIdx = -1;
    var curTokenStackIdx = -1;
    var i, inXmlLen = inXml.length; // counter for length syncs

    // main loop
    for (var offset = 0; offset < inXmlLen; offset++) {
        curToken = curTokenStackIdx == -1 ? null : curTokenStack[curTokenStackIdx];
        curChar = inXml.charAt(offset);
        nextChar = offset + 1 >= inXmlLen ? null : inXml.charAt(offset + 1);
        switch (curChar) {
        case "<":
            if (nextChar == null) {
                throw new Error(EX_MSG + offset);
            }
            if (curToken != null && curToken[0] == 2/*_NEXMLToken.TYPE_TEXT*/ && curToken[2] == 0 && curToken[1] + 1 != offset) {
                curTokenStack[curTokenStackIdx--] = null;
            }
            switch (nextChar) {
            case "!": // DOCTYPE
            case "?": // processing instruction
                throw new Error(EX_MSG + offset);
            case "/": // close tag
                // sync lengths
                for (i = 0; i < curTokenStackIdx && curTokenStack[i] != null; i++) {
                    curTokenStack[i][2] = offset - curTokenStack[i][1];
                }
                // find closest "tag" token in stack that is still open
                do {
                    token = curTokenStack[curTokenStackIdx];
                    curTokenStack[curTokenStackIdx--] = null;
                } while (curTokenStackIdx != -1 && token[0] != 0 /*_NEXMLToken.TYPE_TAG*/);
                // move offset past the closing tag (1 for /)
                /*
                addLength = 2;
                for (; offset < inXmlLen && inXml.charAt(offset) != '>'; offset++) {
                    addLength++;
                }
                */
                offset = inXml.indexOf('>', offset);
                // update token
                token[2] = offset - token[1] + 1;
                // update enclosing
                curToken = null;
                break;
            case "[": // CDATA section
                if (tokenTableIdx == tokenTable.length - 1) { tokenTable[tokenTableIdx + 1] = new Array(5); }
                tokenTable[++tokenTableIdx][0] = 3 /*_NEXMLToken.TYPE_CDATA*/;
                tokenTable[tokenTableIdx][1] = offset;
                tokenTable[tokenTableIdx][2] = 0;
                curTokenStack[++curTokenStackIdx] = tokenTable[tokenTableIdx];
                tokenTable[tokenTableIdx][3] = curTokenStackIdx;
                curToken = tokenTable[tokenTableIdx];
                break;
            default:
                if (tokenTableIdx == tokenTable.length - 1) { tokenTable.push(new Array(5), new Array(5), new Array(5)); }
                tokenTable[++tokenTableIdx][0] = 0 /*_NEXMLToken.TYPE_TAG*/;
                tokenTable[tokenTableIdx][1] = offset;
                tokenTable[tokenTableIdx][2] = 0;
                curTokenStack[++curTokenStackIdx] = tokenTable[tokenTableIdx];
                tokenTable[tokenTableIdx][3] = curTokenStackIdx;
                curToken = tokenTable[tokenTableIdx];
            }
            break;
        case "/":
            if (curToken == null) {
                throw new Error(EX_MSG + offset);
            }
            if (curToken[0] == 0 /*_NEXMLToken.TYPE_TAG*/) {
                // close within tag
                if (nextChar != '>') {
                    throw new Error(EX_MSG + offset);
                }
                offset += 1; // shift offset to pass '>'
                // sync lengths
                for (i = 0; i < curTokenStackIdx + 1 && curTokenStack[i] != null; i++) {
                    curTokenStack[i][2] = offset - curTokenStack[i][1];
                }
                // curTokenStack.pop()
                curTokenStack[curTokenStackIdx--] = null;
            }
            break;
        case ">":
            if (curToken == null) {
                throw new Error(EX_MSG + offset);
            }
            if (tokenTableIdx == tokenTable.length - 1) { tokenTable.push(new Array(5), new Array(5), new Array(5)); }
            addLength = inXml.indexOf('<', offset) - 1;
            if (addLength - offset > 0) {
                tokenTable[++tokenTableIdx][0] = 2 /*_NEXMLToken.TYPE_TEXT*/;
                tokenTable[tokenTableIdx][1] = offset + 1;
                tokenTable[tokenTableIdx][2] = addLength - offset;
                offset = addLength;
                curTokenStack[++curTokenStackIdx] = tokenTable[tokenTableIdx];
                tokenTable[tokenTableIdx][3] = curTokenStackIdx;
                //curToken = tokenTable[tokenTableIdx];
            }
            break;
        case "'":                                                       
        case "\"":
            if (curToken[0] == 1/*_NEXMLToken.TYPE_ATTRIBUTE*/) {
                // remember quote type that opened attribute
                if (curToken[4] == null) {
                    curToken[4] = curChar;
                } else if (curToken[4] == curChar) {
                    // if it appears second time - finish attribute
                    // sync lengths
                    for (i = 0; i < curTokenStackIdx + 1 && curTokenStack[i] != null; i++) {
                        curTokenStack[i][2] = offset - curTokenStack[i][1];
                    }
                    // curTokenStack.pop()
                    curTokenStack[curTokenStackIdx--] = null;
                    break;
                }
            }
        default:
            if (curToken == null) {
                throw new Error(EX_MSG + offset);
            }
            if (curToken[0] == /*_NEXMLToken.TYPE_TAG*/ 0 && curChar == ' ') {
                while (offset + 1 < inXmlLen && inXml.charAt(++offset) == ' ');
                if (offset >= inXmlLen) {
                    throw new Error(EX_MSG + offset);
                }
                if (tokenTableIdx == tokenTable.length - 1) { tokenTable.push(new Array(5), new Array(5), new Array(5)); }
                tokenTable[++tokenTableIdx][0] = 1 /*_NEXMLToken.TYPE_ATTRIBUTE*/;
                tokenTable[tokenTableIdx][1] = offset;
                tokenTable[tokenTableIdx][2] = 1;
                curTokenStack[++curTokenStackIdx] = tokenTable[tokenTableIdx];
                tokenTable[tokenTableIdx][3] = curTokenStackIdx;
                curToken = tokenTable[tokenTableIdx];
            }
        }
        if (curToken != null) {
            curToken[2]++;
        } else if (curTokenStack.length == 1) {
            // first element was just created
            curTokenStack[0][2]++;
        }
    }

    // remove un-used pre-created ones
    tokenTable.splice(tokenTableIdx + 1, tokenTable.length - tokenTableIdx);
    // remove zero length tokens
    for (var i = 0; i < tokenTable.length; i++) {
        if (tokenTable[i][2] == 0) {
            tokenTable.splice(i, 1);
        }
    }
    return tokenTable;
}

NEXMLParser._syncLength = function (tokenStack, offset) {
    for (var i = 0; i < tokenStack.length && tokenStack[i] != null; i++) {
        tokenStack[i][2] = offset - tokenStack[i][1];
    }
}

NEXMLParser.decodeTable = function (inXml, tokenTable) {
    for (var i = 0; i < tokenTable.length; i++) {
        try {
            omc.logger.addEntry(_NEXMLToken.dump(tokenTable[i], inXml));
        } catch (e) {}
        try {
            console.info(_NEXMLToken.dump(tokenTable[i], inXml));
        } catch (e) {}
    }
}

////////////////////////////////////////

function _NEXMLToken() {
    this.length = 0;
}

_NEXMLToken.TYPE_TAG = 0;
_NEXMLToken.TYPE_ATTRIBUTE = 1;
_NEXMLToken.TYPE_TEXT = 2;
_NEXMLToken.TYPE_CDATA = 3;

_NEXMLToken.TYPES_NAMES = [ "TAG", "ATTR", "TEXT", "CDATA" ];

_NEXMLToken.dump = function (token, inXml) {
    return _NEXMLToken.asString(token) + " decode=" + _NEXMLToken.decode(token, inXml);
}

_NEXMLToken.decode = function (token, inXml) {
    return inXml.substr(token[1], token[2]);
}

_NEXMLToken.asString = function (token) {
    return "Token: " + _NEXMLToken.TYPES_NAMES[token[0]] + " offset=" + token[1] + " length=" + token[2] + " depth=" + token[3];
}

////////////////////////////////////////

function _NEXMLToken_Tag(offset, depth) {
    this.init(_NEXMLToken.TYPE_TAG, offset, depth);
}
_NEXMLToken_Tag.prototype = new _NEXMLToken();

////////////////////////////////////////

function _NEXMLToken_Text(offset, depth) {
    this.init(_NEXMLToken.TYPE_TEXT, offset, depth);
}
_NEXMLToken_Text.prototype = new _NEXMLToken();

////////////////////////////////////////

function _NEXMLToken_CDATA(offset, depth) {
    this.init(_NEXMLToken.TYPE_CDATA, offset, depth);
}
_NEXMLToken_CDATA.prototype = new _NEXMLToken();

////////////////////////////////////////

function _NEXMLToken_Attribute(offset, depth) {
    this.init(_NEXMLToken.TYPE_ATTRIBUTE, offset, depth);
}

_NEXMLToken_Attribute.prototype = new _NEXMLToken();

_NEXMLToken_Attribute.isFinished = function (token, elem) {
    if (token[0] == _NEXMLToken.TYPE_ATTRIBUTE) {
        if (token[3] == null) {
            token[3] = elem;
            return false;
        } else {
            return token[3] == elem;
        }
    }
    throw new Error("attempt to check 'isFinishied' on non-attribute token.");
}

////////////////////////////////////////

function NEXMLDocument(inString, tokenTable) {

}