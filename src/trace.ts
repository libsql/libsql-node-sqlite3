// This code is adapted from node-sqlite3

// Copyright (c) MapBox
// All rights reserved.
// 
// Redistribution and use in source and binary forms, with or without modification,
// are permitted provided that the following conditions are met:
// 
// - Redistributions of source code must retain the above copyright notice, this
//   list of conditions and the following disclaimer.
// - Redistributions in binary form must reproduce the above copyright notice, this
//   list of conditions and the following disclaimer in the documentation and/or
//   other materials provided with the distribution.
// - Neither the name "MapBox" nor the names of its contributors may be
//   used to endorse or promote products derived from this software without
//   specific prior written permission.
// 
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
// ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
// ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

import util from "node:util";

export function extendTrace(object: any, property: string, pos?: number) {
    const old = object[property];
    object[property] = function() {
        const error = new Error();
        const name = object.constructor.name + "#" + property + "(" +
            Array.prototype.slice.call(arguments).map(function(el) {
                return util.inspect(el, false, 0);
            }).join(", ") + ")";

        if (typeof pos === "undefined") pos = -1;
        if (pos < 0) pos += arguments.length;
        const cb = arguments[pos];
        if (typeof arguments[pos] === "function") {
            arguments[pos] = function replacement() {
                const err = arguments[0];
                if (err && err.stack && !err.__augmented) {
                    err.stack = filter(err).join("\n");
                    err.stack += "\n--> in " + name;
                    err.stack += "\n" + filter(error).slice(1).join("\n");
                    err.__augmented = true;
                }
                return cb.apply(this, arguments);
            };
        }
        return old.apply(this, arguments);
    };
}

function filter(error: any): Array<string> {
    return error.stack.split("\n").filter(function(line: string) {
        return line.indexOf(__filename) < 0;
    });
}
