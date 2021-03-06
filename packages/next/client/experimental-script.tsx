import React, { useEffect, useContext } from 'react'
import { ScriptHTMLAttributes } from 'react'
import { HeadManagerContext } from '../next-server/lib/head-manager-context'
import { DOMAttributeNames } from './head-manager'
import { requestIdleCallback } from './request-idle-callback'

const ScriptCache = new Map()
const LoadCache = new Set()

export interface Props extends ScriptHTMLAttributes<HTMLScriptElement> {
  strategy?: 'afterInteraction' | 'lazy' | 'beforeInteraction'
  id?: string
  onLoad?: () => void
  onError?: () => void
  children?: React.ReactNode
  preload?: boolean
}

const ignoreProps = [
  'onLoad',
  'dangerouslySetInnerHTML',
  'children',
  'onError',
  'strategy',
  'preload',
]

const loadScript = (props: Props): void => {
  const {
    src,
    id,
    onLoad = () => {},
    dangerouslySetInnerHTML,
    children = '',
    onError,
  } = props

  const cacheKey = id || src
  if (ScriptCache.has(src)) {
    if (!LoadCache.has(cacheKey)) {
      LoadCache.add(cacheKey)
      // Execute onLoad since the script loading has begun
      ScriptCache.get(src).then(onLoad, onError)
    }
    return
  }

  const el = document.createElement('script')

  const loadPromise = new Promise((resolve, reject) => {
    el.addEventListener('load', function () {
      resolve()
      if (onLoad) {
        onLoad.call(this)
      }
    })
    el.addEventListener('error', function () {
      reject()
      if (onError) {
        onError()
      }
    })
  })

  if (src) {
    ScriptCache.set(src, loadPromise)
    LoadCache.add(cacheKey)
  }

  if (dangerouslySetInnerHTML) {
    el.innerHTML = dangerouslySetInnerHTML.__html || ''
  } else if (children) {
    el.textContent =
      typeof children === 'string'
        ? children
        : Array.isArray(children)
        ? children.join('')
        : ''
  } else if (src) {
    el.src = src
  }

  for (const [k, value] of Object.entries(props)) {
    if (value === undefined || ignoreProps.includes(k)) {
      continue
    }

    const attr = DOMAttributeNames[k] || k.toLowerCase()
    el.setAttribute(attr, value)
  }

  document.body.appendChild(el)
}

function handleClientScriptLoad(props: Props) {
  const { strategy = 'afterInteraction' } = props
  if (strategy === 'afterInteraction') {
    loadScript(props)
  } else if (strategy === 'lazy') {
    window.addEventListener('load', () => {
      requestIdleCallback(() => loadScript(props))
    })
  }
}

function loadLazyScript(props: Props) {
  if (document.readyState === 'complete') {
    requestIdleCallback(() => loadScript(props))
  } else {
    window.addEventListener('load', () => {
      requestIdleCallback(() => loadScript(props))
    })
  }
}

export function initScriptLoader(scriptLoaderItems: Props[]) {
  scriptLoaderItems.forEach(handleClientScriptLoad)
}

function Script(props: Props): JSX.Element | null {
  const {
    src = '',
    onLoad = () => {},
    dangerouslySetInnerHTML,
    strategy = 'afterInteraction',
    onError,
    preload = false,
    ...restProps
  } = props

  // Context is available only during SSR
  const { updateScripts, scripts } = useContext(HeadManagerContext)

  useEffect(() => {
    if (strategy === 'afterInteraction') {
      loadScript(props)
    } else if (strategy === 'lazy') {
      loadLazyScript(props)
    }
  }, [props, strategy])

  if (!process.env.__NEXT_SCRIPT_LOADER) {
    return null
  }

  if (strategy === 'afterInteraction') {
    if (updateScripts && preload) {
      scripts.afterInteraction = (scripts.afterInteraction || []).concat([src])
      updateScripts(scripts)
    }
  } else if (strategy === 'beforeInteraction') {
    if (updateScripts) {
      scripts.beforeInteraction = (scripts.beforeInteraction || []).concat([
        {
          src,
          onLoad,
          onError,
          ...restProps,
        },
      ])
      updateScripts(scripts)
    }
  }

  return null
}

export default Script
