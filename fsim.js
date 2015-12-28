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

    /**********************************************************************
     * INTERFACE CODE
     **********************************************************************/

    var history = document.getElementById('history');
    var ptree = document.getElementById('ptree');
    var pretty = document.getElementById('pretty');
    var ptreeErr = document.getElementById('ptreeErr');
    var inputbox = document.getElementById('inputbox');

    var handleEnter = function(ev) {
        if (!ev) ev = window.event;
        var key = ev.keyCode || ev.which;
        if (key != '13') return true;
        if (!inputbox.value) return true;

        while (pretty.firstChild) pretty.removeChild(pretty.firstChild);

        var ter = tokenizer(inputbox.value);
        var pt = parseTerm(ter);
        prettyTerm(pretty,pt);
 };

    var handleInput = function() {
        while (ptree.firstChild) ptree.removeChild(ptree.firstChild);
        ptreeErr.textContent = '';

        if (!inputbox.value) return true;

        try {
            var ter = tokenizer(inputbox.value);
            var pt = parseTerm(ter);
            showParseTree(pt, ptree);
        } catch (err) {
            ptreeErr.textContent = err;
        }
    };


    inputbox.addEventListener('keypress', handleEnter);
    inputbox.addEventListener('input', handleInput);
    inputbox.disabled = false;

    /**********************************************************************
     * PARSER
     **********************************************************************/

    /* Tokens:
         let in \ ( ) + - * / -> = VAR CONSTR LITERAL

        Token object:
          kind contains one of the above as a string
               (or 'END' if at the end of input, or 'ERROR')
          value contains the semantic value for VAR, CONSTR, and LITERAL

        tokenizer returns an object with the following methods:
          peek - returns the current token without consuming it
          eat  - returns and consumes the current token
          get  - checks that the current token has the kind given as parameter 
                 and then behaves like eat
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
            case '\\':
            case '(': case ')': case '+': case '*': case '/': case '=':
                return { kind: c };
            case '':
                return { kind: 'END' };
            default:
                var subtext = text.substring(inx - 1);
                var match = /^\d+/.exec(subtext);
                if (match !== null) {
                    inx += match[0].length - 1;
                    return { kind: 'LITERAL',
                             value: parseInt(match[0], 10) };
                }
                match = /^[A-Z]\w*/.exec(subtext);
                if (match !== null) {
                    inx += match[0].length - 1;
                    return { kind: 'CONSTR',
                             value: match[0] };
                }
                match = /^[a-z_]\w*/.exec(subtext);
                if (match !== null) {
                    inx += match[0].length - 1;
                    switch (match[0]) {
                    case 'let': case 'in':
                        return { kind: match[0] };
                    default:
                        return { kind: 'VAR',
                                 value: match[0] };
                    }
                }
                return { kind: 'ERROR' };
            }
        };
        var cur = next();
        return {
            peek: function() {
                return cur;
            },
            eat: function() {
                var rv = cur;
                cur = next();
                return rv;
            },
            get: function(k) {
                if (cur.kind !== k) {
                    throw 'Parse error: expected ' +
                        k +
                        ', got ' +
                        cur.kind;
                }
                return this.eat();
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
               | "-" term3 [ "-" ]
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

     Parse functions return parse tree objects.

    */

    var parseTerm = function parseTerm(ter) {
        switch (ter.peek().kind) {
        case 'let':
            return (function() {
                ter.eat();
                var x = ter.get('VAR').value;
                ter.get('=');
                var t = parseTerm(ter);
                ter.get('in');
                var u = parseTerm(ter);
                return { op: 'let',
                         x: x,
                         t: t,
                         u: u };
            })();
        case '\\':
            return (function() {
                ter.eat();
                var x = ter.get('VAR').value;
                ter.get('->');
                var t = parseTerm(ter);
                return { op: 'lambda',
                         x: x,
                         t: t };
            })();
        case 'VAR': case 'CONSTR': case 'LITERAL': case '(': case '-':
            return parseTerm1(ter);
        default:
            throw 'Parse error: ' +
                'expected a variable, a constructor, "(", or "-"' +
                ', got ' + ter.peek().kind;
        }
    };

    var parseTerm1 = function parseTerm1(ter) {
        var l = parseTerm2(ter);
        var r;
        while (true) {
            switch (ter.peek().kind) {
            case '+':
                ter.eat();
                r = parseTerm2(ter);
                l = { op: '+',
                      l: l,
                      r: r };
                break;
            case '-':
                ter.eat();
                r = parseTerm2(ter);
                l = { op: '-',
                      l: l,
                      r: r };
                break;
            case 'END': case 'in': case ')':
                return l;
            default:
                throw 'Parse error: ' +
                    'expected the end of input, "in", ")", "+", or "-"' +
                    ', got ' + ter.peek().kind;
            }
        }
    };

    var parseTerm2 = function parseTerm2(ter) {
        var l = parseTerm3(ter);
        var r;
        while (true) {
            switch (ter.peek().kind) {
            case '*':
                ter.eat();
                r = parseTerm2(ter);
                l = { op: '*',
                      l: l,
                      r: r };
                break;
            case '/':
                ter.eat();
                r = parseTerm2(ter);
                l = { op: '*',
                      l: l,
                      r: r };
                break;
            case 'END': case 'in': case ')': case '+': case '-':
                return l;
            default:
                throw 'Parse error: ' +
                    'expected the end of input, ' +
                    '"in", ")", "+", "-", "*", or "/"' +
                    ', got ' + ter.peek().kind;
            }
        }
    };


    var parseTerm3 = function parseTerm3(ter) {
        var r;
        switch (ter.peek().kind) {
        case '-':
            ter.eat();
            r = parseTerm3(ter);
            return { op: 'neg', r: r };
        case 'VAR': case 'CONSTR': case 'LITERAL': case '(':
            return parseTerm4(ter);
        default:
                throw 'Parse error: ' +
                    'expected a variable, a constructor, "-" or "("' +
                    ', got ' + ter.peek().kind;
        }
    };

    var parseTerm4 = function parseTerm4(ter) {
        var l = parseTerm5(ter);
        var r;
        while (true) {
            switch (ter.peek().kind) {
            case 'VAR': case 'CONSTR': case 'LITERAL': case '(':
                r = parseTerm5(ter);
                l = { op: 'app',
                      l: l,
                      r: r };
                break;
            case 'END': case 'in': case ')':
            case '+': case '-': case '*': case '/':
                return l;
            default:
                throw 'Parse error: ' +
                'expected a variable, a constructor, the end of input, ' +
                    '"in", "(", ")", "+", "-", "*", or "/"' +
                    ', got ' + ter.peek().kind;
            }
        }
    };

    var parseTerm5 = function parseTerm5(ter) {
        var inner;
        switch (ter.peek().kind) {
        case 'VAR':
            inner = ter.eat().value;
            return { op: 'var', name: inner };
        case 'CONSTR':
            inner = ter.eat().value;
            return { op: 'constr', name: inner };
        case 'LITERAL':
            inner = ter.eat().value;
            return { op: 'literal', value: inner };
        case '(':
            ter.eat();
            inner = parseTerm(ter);
            ter.get(')');
            return inner;
        default:
                throw 'Parse error: ' +
                    'expected a variable, a constructor, or "("' +
                    ', got ' + ter.peek().kind;
        }
    };

    /**********************************************************************
     * PRETTYPRINTERS
     **********************************************************************/

    // just show the parse tree
    var showParseTree = function showParseTree(root, elem) {
        var sub1 = document.createElement('li');
        sub1.textContent = root.op;
        elem.appendChild(sub1);
        var sub2 = document.createElement('ul');
        switch (root.op) {
        case 'let':
            sub1.textContent += ' [' + root.x + ']';
            sub1.appendChild(sub2);
            showParseTree(root.t, sub2);
            showParseTree(root.u, sub2);
            break;
        case 'lambda':
            sub1.textContent += ' [' + root.x + ']';
            sub1.appendChild(sub2);
            showParseTree(root.t, sub2);
            break;
        case '+': case '-': case '*': case '/': case 'app':
            sub1.appendChild(sub2);
            showParseTree(root.l, sub2);
            showParseTree(root.r, sub2);
            break;
        case 'neg':
            sub1.appendChild(sub2);
            showParseTree(root.r, sub2);
            break;
        case 'var': case 'constr':
            sub1.textContent += ' [' + root.name + ']';
            break;
        case 'literal':
            sub1.textContent += ' [' + root.value + ']';
            break;
        default:
            throw 'Show error!';
        }
    };

    // prettyprint into DOM
    // (grammar as above, with the //-variants instead of the _-variants)
    var prettyTerm = function prettyTerm(container, term) {
        var cont1;
        switch (term.op) {
        case 'let':
            cont1 = prettyTermContainer(container, term);
            prettyKeyword(cont1, 'let');
            prettySpace(cont1);
            prettyVariable(cont1, term.x);
            prettySpace(cont1);
            prettyOperator(cont1, '=');
            prettySpace(cont1);
            prettyTerm(cont1, term.t);
            prettySpace(cont1);
            prettyKeyword(cont1, 'in');
            prettySpace(cont1);
            prettyTerm(cont1, term.u);
            break;
        case 'lambda':
            cont1 = prettyTermContainer(container, term);
            prettyOperator(cont1, '\\');
            prettySpace(cont1);
            prettyVariable(cont1, term.x);
            prettySpace(cont1);
            prettyOperator(cont1, '->');
            prettySpace(cont1);
            prettyTerm(cont1, term.t);
            break;
        default:
            prettyTerm1(container, term);
        }
    };

    var prettyTerm1 = function prettyTerm1(container, term) {
        var cont1;
        switch (term.op) {
        case '+': case '-':
            cont1 = prettyTermContainer(container, term);
            prettyTerm1(cont1, term.l);
            prettySpace(cont1);
            prettyOperator(cont1, term.op);
            prettySpace(cont1);
            prettyTerm2(cont1, term.r);
            break;
        default:
            prettyTerm2(container, term);
        }
    };

    var prettyTerm2 = function prettyTerm2(container, term) {
        var cont1;
        switch (term.op) {
        case '*': case '/':
            cont1 = prettyTermContainer(container, term);
            prettyTerm2(cont1, term.l);
            prettySpace(cont1);
            prettyOperator(cont1, term.op);
            prettySpace(cont1);
            prettyTerm3(cont1, term.r);
            break;
        default:
            prettyTerm3(container, term);
        }
    };

    var prettyTerm3 = function prettyTerm3(container, term) {
        var cont1;
        switch (term.op) {
        case 'neg':
            cont1 = prettyTermContainer(container, term);
            prettyOperator(cont1, term.op);
            prettySpace(cont1);
            prettyTerm3(cont1, term.r);
            break;
        default:
            prettyTerm4(container, term);
        }
    };

    var prettyTerm4 = function prettyTerm4(container, term) {
        var cont1;
        switch (term.op) {
        case 'app':
            cont1 = prettyTermContainer(container, term);
            prettyTerm4(cont1, term.l);
            prettySpace(cont1);
            prettyTerm5(cont1, term.r);
            break;
        default:
            prettyTerm5(container, term);
        }
    };

    var prettyTerm5 = function prettyTerm5(container, term) {
        var cont1;
        switch (term.op) {
        case 'var':
            cont1 = prettyTermContainer(container, term);
            prettyVariable(cont1, term.name);
            break;
        case 'constr':
            cont1 = prettyTermContainer(container, term);
            prettyConstructor(cont1, term.name);
            break;
        case 'literal':
            cont1 = prettyTermContainer(container, term);
            prettyConstant(cont1, term.value);
            break;
        default:
            cont1 = prettyTermContainer(container, term);
            prettyParen(cont1, '(');
            prettyTerm(cont1, term);
            prettyParen(cont1, ')');
        }
    };

    var prettyTermContainer = function(container, term) {
        var span = document.createElement('span');
        container.appendChild(span);
        return span;
    };

    var prettyKeyword = function(container, keyword) {
        var span = document.createElement('span');
        span.setAttribute('class', 'prettyKeyword');
        span.textContent = keyword;
        container.appendChild(span);
    };

    var prettySpace = function(container) {
        var n = document.createTextNode(' ');
        container.appendChild(n);
    };

    var prettyVariable = function(container, name) {
        var span = document.createElement('span');
        span.setAttribute('class', 'prettyVariable');
        span.textContent = name;
        container.appendChild(span);
    };

    var prettyOperator = function(container, name) {
        var span = document.createElement('span');
        span.setAttribute('class', 'prettyOperator');
        span.textContent = name;
        container.appendChild(span);
    };

    var prettyConstructor = function(container, name) {
        var span = document.createElement('span');
        span.setAttribute('class', 'prettyConstructor');
        span.textContent = name;
        container.appendChild(span);
    };

    var prettyConstant = function(container, name) {
        var span = document.createElement('span');
        span.setAttribute('class', 'prettyConstant');
        span.textContent = name;
        container.appendChild(span);
    };

    var prettyParen = function(container, ch) {
        var span = document.createElement('span');
        span.setAttribute('class', 'prettyParen');
        span.textContent = ch;
        container.appendChild(span);
    };

})();
