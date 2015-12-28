/*
  Copyright 2015 Antti-Juhani Kaijanaho

  Permission is hereby granted, free of charge, to any person
  obtaining a copy of this software and associated documentation files
  (the "Software"), to deal in the Software without restriction,
  including without limitation the rights to use, copy, modify, merge,
  publish, distribute, sublicense, and/or sell copies of the Software,
  and to permit persons to whom the Software is furnished to do so,
  subject to the following conditions:

  The above copyright notice and this permission notice shall be
  included in all copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
  EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
  NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
  BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
  ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
  CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
*/

(function() {
    'use strict';

    var history = document.getElementById('history');
    var inputbox = document.getElementById('inputbox');

    var handleEnter = function(ev) {
        if (!ev) ev = window.event;
        var key = ev.keyCode || ev.which;
        if (key != '13') return true;
        if (!inputbox.value) return true;

        while (history.firstChild) history.removeChild(history.firstChild);

        var count = 0;
        var ter = tokenizer(inputbox.value);
        while (count < 1000 && ter.peek().kind !== '') {
            var t = ter.get();
            var p = document.createElement('li');
            p.textContent = t.kind + ' (' + t.value + ')';
            history.appendChild(p);
            count++;
            
        }
    };

    /* Tokens:
         let in \ ( ) + - * / -> = VAR CONSTR LITERAL

        Token object:
          kind contains one of the above as a string
               (or '' if at the end of input, or 'ERROR')
          value contains the semantic value for VAR, CONSTR, and LITERAL

        tokenizer returns an object with the following methods:
          peek - returns the current token without consuming it
          get  - returns and consumes the current token
    */
    var tokenizer = function tokenizer(text) {
        var inx = 0;
        var next = function next() {
            var c = text.charAt(inx++);
            while (c === ' ' || c === '\t' || c === '\n') {
                c = text.charAt(inx++);
            }
            switch (c) {
            case '-':
                if (text.charAt(inx) === '>') {
                    inx++;
                    return { kind: '->' };
                }
                /* fallthrough */
            case '': case '\\': case '(': case ')':
            case '+': case '*': case '/': case '=':
                return { kind: c };
            default:
                var subtext = text.substring(inx-1);
                var match = /^\d+/.exec(subtext);
                if (match !== null) {
                    inx += match[0].length-1;
                    return { kind: 'LITERAL',
                             value: parseInt(match[0], 10) };
                }
                match = /^[A-Z]\w*/.exec(subtext);
                if (match !== null) {
                    inx += match[0].length-1;
                    return { kind: 'CONSTR',
                             value: match[0] };
                }
                match = /^[a-z_]\w*/.exec(subtext);
                if (match !== null) {
                    inx += match[0].length-1;
                    return { kind: 'VAR',
                             value: match[0] };
                }
                return { kind: 'ERROR' };
            }
        };
        var cur = next();
        return {
            peek: function() {
                return cur;
            },
            get: function() {
                var rv = cur;
                cur = next();
                return rv;
            }
        };
    };

    /* term   -> term1                          [ VAR CONSTR "(" "-" ]
               | "let" VAR "="  term "in" term  [ "let" ]
               | "\"   VAR "->" term            [ "\" ]
                 FIRST:  VAR CONSTR "(" "-" "let "\"
                 FOLLOW: END "in" ")"

       //term1  -> term2
       //        | term1 '+' term2
       //        | term1 '-' term2

       term1  -> term2 term1_ [ VAR CONSTR "(" "-" ]
                 FIRST:  VAR CONSTR "(" "-"
                 FOLLOW: END "in" ")"

       term1_ -> empty            [ END "in" ")" ]
               | '+' term2 term1_ [ "+" ]
               | '-' term2 term1_ [ "-" ]
                 NULLABLE
                 FIRST:  '+' '-'
                 FOLLOW: END "in" ")"

       //term2  -> term3
       //        | term2 '*' term3
       //        | term2 '/' term3

       term2  -> term3 term2_ [ VAR CONSTR "(" "-" ]
                 FIRST:  VAR CONSTR "(" "-"
                 FOLLOW: END "in" ")" "+" "-"

       term2_ -> empty            [ END "in" ")" "+" "-" ]
               | '*' term3 term2_ [ "*" ]
               | '/' term3 term2_ [ "/" ]
                 NULLABLE
                 FIRST: '*' '/'
                 FOLLOW: END "in" ")" "+" "-"

       term3  -> term4     [ VAR CONSTR "(" ]
               | "-" term4 [ "-" ]
                 FIRST:  VAR CONSTR "(" "-"
                 FOLLOW: END "in" ")" "+" "-" "*" "/"

       //term4  -> term5
       //        | term4 term5

       term4  -> term5 term4_ [ VAR CONSTR "(" ]
                 FIRST:  VAR CONSTR "("
                 FOLLOW: END "in" ")" "+" "-" "*" "/"

       term4_ -> empty        [ END "in" ")" "+" "-" "*" "/" ]
               | term5 term4_ [ VAR CONSTR "(" ]
                 NULLABLE
                 FIRST:  VAR CONSTR "("
                 FOLLOW: END "in" ")" "+" "-" "*" "/"

       term5  -> VAR          [ VAR ]
               | CONSTR       [ CONSTR ]
               | "(" term ")" [ "(" ]
                 FIRST:  VAR CONSTR "("
                 FOLLOW: END "in" ")" "+" "-" "*" "/" VAR CONSTR "("

     */


    inputbox.addEventListener('keypress', handleEnter);
    inputbox.disabled = false;

})();
