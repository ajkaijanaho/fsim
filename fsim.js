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
    var pretty2 = document.getElementById('pretty2');
    var ptreeErr = document.getElementById('ptreeErr');
    var inputbox = document.getElementById('inputbox');

    var prettyHooks = {}
    
    prettyHooks.setupBetaRedex = function(domElement, termAST) {
        domElement.addEventListener('mouseover', function(ev) {
            ev.stopPropagation();
            domElement.setAttribute('class', 'beta-redex');
        });
        domElement.addEventListener('mouseout', function(ev) {
            ev.stopPropagation();
            domElement.removeAttribute('class');
        });
    };

    var handleEnter = function(ev) {
        if (!ev) ev = window.event;
        var key = ev.keyCode || ev.which;
        if (key != '13') return true;
        if (!inputbox.value) return true;

        while (pretty.firstChild) pretty.removeChild(pretty.firstChild);

        var ter = tokenizer(inputbox.value);
        var pt = parseTerm(ter, {});
        prettyTerm(pretty,prettyHooks,pt);
        var pt2 = cloneParseTree(pt, {});
        prettyTerm(pretty2,{},pt2);
    };

    var handleInput = function() {
        while (ptree.firstChild) ptree.removeChild(ptree.firstChild);
        ptreeErr.textContent = '';

        if (!inputbox.value) return true;

        try {
            var ter = tokenizer(inputbox.value);
            var pt = parseTerm(ter,{});
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

     The bindings parameter is an object containing the current
     bindings: each variable is bound to its binding node up
     in the parse tree.  Also, there is the property '?bindingCount'
     which is increased each time a binding is parsed.

    */

    var parseTerm = function parseTerm(ter, bindings) {
        if (!bindings['?bindingCount']) bindings['?bindingCount'] = 0;
        switch (ter.peek().kind) {
        case 'let':
            return (function() {
                ter.eat();
                var x = ter.get('VAR').value;
                var rv = { op: 'let', x: x };
                var old = bindings[x];
                rv.unique = bindings['?bindingCount']++;
                bindings[x] = rv;
                ter.get('=');
                var t = parseTerm(ter, bindings);
                ter.get('in');
                var u = parseTerm(ter, bindings);
                rv.t = t;
                rv.u = u;
                bindings[x] = old;
                return rv;
            })();
        case '\\':
            return (function() {
                ter.eat();
                var x = ter.get('VAR').value;
                var rv = { op: 'lambda', x: x };
                rv.unique = bindings['?bindingCount']++;                
                var old = bindings[x];
                bindings[x] = rv;
                ter.get('->');
                var t = parseTerm(ter, bindings);
                rv.t = t;
                bindings[x] = old;                
                return rv;
            })();
        case 'VAR': case 'CONSTR': case 'LITERAL': case '(': case '-':
            return parseTerm1(ter, bindings);
        default:
            throw 'Parse error: ' +
                'expected a variable, a constructor, "(", or "-"' +
                ', got ' + ter.peek().kind;
        }
    };

    var parseTerm1 = function parseTerm1(ter, bindings) {
        var l = parseTerm2(ter, bindings);
        var r;
        while (true) {
            switch (ter.peek().kind) {
            case '+':
                ter.eat();
                r = parseTerm2(ter, bindings);
                l = { op: '+',
                      l: l,
                      r: r };
                break;
            case '-':
                ter.eat();
                r = parseTerm2(ter, bindings);
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

    var parseTerm2 = function parseTerm2(ter, bindings) {
        var l = parseTerm3(ter, bindings);
        var r;
        while (true) {
            switch (ter.peek().kind) {
            case '*':
                ter.eat();
                r = parseTerm2(ter, bindings);
                l = { op: '*',
                      l: l,
                      r: r };
                break;
            case '/':
                ter.eat();
                r = parseTerm2(ter, bindings);
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


    var parseTerm3 = function parseTerm3(ter, bindings) {
        var r;
        switch (ter.peek().kind) {
        case '-':
            ter.eat();
            r = parseTerm3(ter, bindings);
            return { op: 'neg', r: r };
        case 'VAR': case 'CONSTR': case 'LITERAL': case '(':
            return parseTerm4(ter, bindings);
        default:
                throw 'Parse error: ' +
                    'expected a variable, a constructor, "-" or "("' +
                    ', got ' + ter.peek().kind;
        }
    };

    var parseTerm4 = function parseTerm4(ter, bindings) {
        var l = parseTerm5(ter, bindings);
        var r;
        while (true) {
            switch (ter.peek().kind) {
            case 'VAR': case 'CONSTR': case 'LITERAL': case '(':
                r = parseTerm5(ter, bindings);
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

    var parseTerm5 = function parseTerm5(ter, bindings) {
        var inner;
        switch (ter.peek().kind) {
        case 'VAR':
            inner = ter.eat().value;
            if (!bindings.hasOwnProperty(inner) || !bindings[inner]) {
                throw "Use of a free variable " + inner +
                    ".  Free variables are not allowed; " +
                    "use constructors instead.";
            }
            return { op: 'var', name: inner, boundBy: bindings[inner] };
        case 'CONSTR':
            inner = ter.eat().value;
            return { op: 'constr', name: inner };
        case 'LITERAL':
            inner = ter.eat().value;
            return { op: 'literal', value: inner };
        case '(':
            ter.eat();
            inner = parseTerm(ter, bindings);
            ter.get(')');
            return inner;
        default:
                throw 'Parse error: ' +
                    'expected a variable, a constructor, or "("' +
                    ', got ' + ter.peek().kind;
        }
    };

    /**********************************************************************
     * PARSE TREE UTILITIES
     **********************************************************************/

    var cloneParseTree = function (pt, seen) {
        if (!pt.op) return pt;
        if (pt.hasOwnProperty("unique") && seen[pt.unique]) {
            return seen[pt.unique];
        }
        var rv = {};
        if (pt.hasOwnProperty("unique")) seen[pt.unique] = rv;
        for (var v in pt) {
            if (!pt.hasOwnProperty(v)) continue;
            rv[v] = cloneParseTree(pt[v], seen);
        }
        return rv;
    };

    /**********************************************************************
     * PRETTYPRINTERS
     **********************************************************************/

    // just show the parse tree
    var showParseTree = function showParseTree(root, elem) {
        var sub1 = document.createElement('li');
        elem.appendChild(sub1);
        var sub2 = document.createElement('span');
        sub1.appendChild(sub2);        
        sub2.textContent = root.op;
        var sub3 = document.createElement('ul');
        switch (root.op) {
        case 'let':
            sub2.textContent += ' [' + root.x + '/' + root.unique + ']';
            sub2.setAttribute('class', 'binding' + root.unique);
            sub1.appendChild(sub3);
            showParseTree(root.t, sub3);
            showParseTree(root.u, sub3);
            break;
        case 'lambda':
            sub2.textContent += ' [' + root.x + '/' + root.unique + ']';
            sub2.setAttribute('class', 'binding' + root.unique);
            sub1.appendChild(sub3);
            showParseTree(root.t, sub3);
            break;
        case '+': case '-': case '*': case '/': case 'app':
            sub1.appendChild(sub3);
            showParseTree(root.l, sub3);
            showParseTree(root.r, sub3);
            break;
        case 'neg':
            sub1.appendChild(sub3);
            showParseTree(root.r, sub3);
            break;
        case 'var':
            sub2.textContent +=
                ' [' + root.name + '/' + root.boundBy.unique + ']';
            sub2.setAttribute('class', 'binding' + root.boundBy.unique);
            break;
        case 'constr':
            sub2.textContent += ' [' + root.name + ']';
            break;
        case 'literal':
            sub2.textContent += ' [' + root.value + ']';
            break;
        default:
            throw 'Show error!';
        }
    };

    // prettyprint into DOM
    // (grammar as above, with the //-variants instead of the _-variants)
    var prettyTerm = function prettyTerm(container, hooks, term) {
        var cont1;
        switch (term.op) {
        case 'let':
            cont1 = prettyTermContainer(container, term);
            prettyKeyword(cont1, 'let');
            prettySpace(cont1);
            prettyVariable(cont1, term.x, term.unique);
            prettySpace(cont1);
            prettyOperator(cont1, '=');
            prettySpace(cont1);
            prettyTerm(cont1, hooks, term.t);
            prettySpace(cont1);
            prettyKeyword(cont1, 'in');
            prettySpace(cont1);
            prettyTerm(cont1, hooks, term.u);
            break;
        case 'lambda':
            cont1 = prettyTermContainer(container, term);
            prettyOperator(cont1, '\\');
            prettySpace(cont1);
            prettyVariable(cont1, term.x, term.unique);
            prettySpace(cont1);
            prettyOperator(cont1, '->');
            prettySpace(cont1);
            prettyTerm(cont1, hooks, term.t);
            break;
        default:
            prettyTerm1(container, hooks, term);
        }
    };

    var prettyTerm1 = function prettyTerm1(container, hooks, term) {
        var cont1;
        switch (term.op) {
        case '+': case '-':
            cont1 = prettyTermContainer(container, term);
            prettyTerm1(cont1, hooks, term.l);
            prettySpace(cont1);
            prettyOperator(cont1, term.op);
            prettySpace(cont1);
            prettyTerm2(cont1, hooks, term.r);
            break;
        default:
            prettyTerm2(container, hooks, term);
        }
    };

    var prettyTerm2 = function prettyTerm2(container, hooks, term) {
        var cont1;
        switch (term.op) {
        case '*': case '/':
            cont1 = prettyTermContainer(container, term);
            prettyTerm2(cont1, hooks, term.l);
            prettySpace(cont1);
            prettyOperator(cont1, term.op);
            prettySpace(cont1);
            prettyTerm3(cont1, hooks, term.r);
            break;
        default:
            prettyTerm3(container, hooks, term);
        }
    };

    var prettyTerm3 = function prettyTerm3(container, hooks, term) {
        var cont1;
        switch (term.op) {
        case 'neg':
            cont1 = prettyTermContainer(container, term);
            prettyOperator(cont1, '-');
            prettyTerm3(cont1, hooks, term.r);
            break;
        default:
            prettyTerm4(container, hooks, term);
        }
    };

    var prettyTerm4 = function prettyTerm4(container, hooks, term) {
        var cont1;
        switch (term.op) {
        case 'app':
            cont1 = prettyTermContainer(container, term);
            if (hooks.setupBetaRedex && term.l.op === 'lambda') {
                hooks.setupBetaRedex(cont1, term);
            }
            prettyTerm4(cont1, hooks, term.l);
            prettySpace(cont1);
            prettyTerm5(cont1, hooks, term.r);
            break;
        default:
            prettyTerm5(container, hooks, term);
        }
    };

    var prettyTerm5 = function prettyTerm5(container, hooks, term) {
        var cont1;
        switch (term.op) {
        case 'var':
            cont1 = prettyTermContainer(container, term);
            prettyVariable(cont1, term.name, term.boundBy.unique);
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
            prettyTerm(cont1, hooks, term);
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

    var prettyVariable = function(container, name, unique) {
        var span = document.createElement('span');
        span.setAttribute('class', 'prettyVariable');
        span.setAttribute('class', 'binding' + unique);
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
