const p = require('path')
// const printAST = require('ast-pretty-print')

const macrosRegex = /[./]macros(\.js)?$/

module.exports = macrosPlugin

function macrosPlugin() {
  return {
    name: 'macros',
    visitor: {
      ImportDeclaration(path, state) {
        const isMacros = looksLike(path, {
          node: {
            source: {
              value: v => macrosRegex.test(v),
            },
          },
        })
        if (!isMacros) {
          return
        }
        const name = path.node.specifiers[0].local.name
        const source = path.node.source.value
        applyMacros({path, name, source, state})
        path.remove()
      },
      CallExpression(path, state) {
        const isMacros = looksLike(path, {
          node: {
            callee: {
              type: 'Identifier',
              name: 'require',
            },
            arguments: args =>
              args.length === 1 && macrosRegex.test(args[0].value),
          },
          parent: {
            type: 'VariableDeclarator',
          },
        })
        if (!isMacros) {
          return
        }
        const name = path.parent.id.name
        const source = path.node.arguments[0].value
        applyMacros({path, name, source, state})
        path.parentPath.remove()
      },
    },
  }
}

function applyMacros({path, name, source, state}) {
  const {file: {opts: {filename}}} = state
  const referencePaths = path.scope.getBinding(name).referencePaths
  if (referencePaths && referencePaths.length) {
    const requirePath = p.join(p.dirname(filename), source)
    // eslint-disable-next-line import/no-dynamic-require
    const macros = require(requirePath)
    referencePaths.forEach(ref => {
      // TODO: if the macros doesn't support one of the methods,
      // and someone tries to use it that way, then throw a helpful
      // error message
      if (ref.parentPath.type === 'TaggedTemplateExpression') {
        macros.asTag(ref.parentPath.get('quasi'), state)
      } else if (ref.parentPath.type === 'CallExpression') {
        macros.asFunction(ref.parentPath.get('arguments'), state)
      } else if (ref.parentPath.type === 'JSXOpeningElement') {
        macros.asJSX(
          {
            attributes: ref.parentPath.get('attributes'),
            children: ref.parentPath.parentPath.get('children'),
          },
          state,
        )
      } else {
        // TODO: throw a helpful error message
      }
    })
  }
}

function looksLike(a, b) {
  return (
    a &&
    b &&
    Object.keys(b).every(bKey => {
      const bVal = b[bKey]
      const aVal = a[bKey]
      if (typeof bVal === 'function') {
        return bVal(aVal)
      }
      return isPrimitive(bVal) ? bVal === aVal : looksLike(aVal, bVal)
    })
  )
}

function isPrimitive(val) {
  // eslint-disable-next-line
  return val == null || /^[sbn]/.test(typeof val);
}
