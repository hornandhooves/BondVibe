"use strict";

/**
 * ESLint rule: no-unguarded-async-state
 *
 * Flags the KIN-92/94/95 anti-pattern: a `setX(true)` state-setter call,
 * followed (in the same block) by something that can throw — an `await`, a
 * `Promise.all(...)`, or a `.then(...)` chain — with no enclosing
 * try/catch/finally before the matching `setX(false)`. If the async work
 * rejects, `setX(false)` never runs and the UI is stuck in that state
 * forever (a spinner that never resolves, or a button stuck disabled).
 *
 * This is a pragmatic, statement-level heuristic, not a full data-flow
 * analysis: it scans the statements between a `setX(true)` and the next
 * matching `setX(false)` (or the next `TryStatement`, which is treated as
 * "already handled, stop looking") within the SAME block, and flags the
 * first one that contains `await`, `Promise.all(`, or `.then(` outside a
 * try. It will not catch every possible shape (e.g. the risky call hidden
 * inside a helper function called without await is out of scope on
 * purpose — this rule only looks at the immediate block), but it catches
 * exactly the pattern that has already reproduced 35+ times in this
 * codebase, and is simple enough to reason about and maintain.
 *
 * Fix: wrap the risky call in try/catch/finally (finally sets the state back
 * to false), or — preferred — use the shared `useAsyncLoad()` hook
 * (`src/hooks/useAsyncLoad.js`), which makes this the default instead of
 * something to remember.
 */

const STATE_SETTER_RE = /^set[A-Z]/;
const RISKY_CALL_RE = /\bawait\b|\bPromise\.all\(|\.then\(/;

function isBooleanLiteral(node, value) {
  return !!node && node.type === "Literal" && node.value === value;
}

function isSetterCall(stmt, name, boolValue) {
  return (
    stmt.type === "ExpressionStatement" &&
    stmt.expression.type === "CallExpression" &&
    stmt.expression.callee.type === "Identifier" &&
    (name ? stmt.expression.callee.name === name : STATE_SETTER_RE.test(stmt.expression.callee.name)) &&
    isBooleanLiteral(stmt.expression.arguments[0], boolValue)
  );
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow setX(true) -> unguarded await/Promise.all/.then -> setX(false) with no try/catch/finally (KIN-92/94/95: leaves the UI stuck forever on any rejection).",
      recommended: false,
    },
    schema: [],
    messages: {
      unguarded:
        "'{{name}}(true)' is followed by async work with no try/catch/finally before '{{name}}(false)'. If the awaited call throws, '{{name}}' never resets and the UI hangs forever (see KIN-92/94/95). Wrap it in try/catch/finally, or use useAsyncLoad() from src/hooks/useAsyncLoad.js.",
    },
  },

  create(context) {
    function checkBlock(block) {
      if (!block || block.type !== "BlockStatement") return;
      const stmts = block.body;

      for (let i = 0; i < stmts.length; i++) {
        const stmt = stmts[i];
        if (!isSetterCall(stmt, null, true)) continue;

        const setterName = stmt.expression.callee.name;

        for (let j = i + 1; j < stmts.length; j++) {
          const later = stmts[j];

          if (isSetterCall(later, setterName, false)) break; // reset reached, clean

          if (later.type === "TryStatement") break; // guarded — stop looking for this pair

          const text = context.sourceCode.getText(later);
          if (RISKY_CALL_RE.test(text)) {
            context.report({ node: stmt, messageId: "unguarded", data: { name: setterName } });
            break;
          }
        }
      }
    }

    function visitFunction(node) {
      // Only handle block-bodied functions; `() => doAsync()` expression-bodied
      // arrows have nothing to scan (no sibling statements to check against).
      if (node.body && node.body.type === "BlockStatement") checkBlock(node.body);
    }

    return {
      FunctionDeclaration: visitFunction,
      FunctionExpression: visitFunction,
      ArrowFunctionExpression: visitFunction,
    };
  },
};
