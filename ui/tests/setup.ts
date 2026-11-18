/**
 * The test document, as Kiro Crew's dashboard suite sets it up for these same
 * tests (`website/integration/setup.ts`): happy-dom with the polyfills the
 * page's components need, and no real socket.
 */
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { resetStubSdk } from './stubs/app-sdk'

afterEach(() => {
  cleanup()
  resetStubSdk()
})



// jsdom polyfill: PointerEvent. Radix UI (@radix-ui/react-dropdown-menu,
// @radix-ui/react-context-menu) checks `event instanceof PointerEvent` and
// ignores events that aren't pointer events. jsdom doesn't implement
// PointerEvent, so menus never open without this stub.
if (typeof window !== 'undefined' && !window.PointerEvent) {
  class Polyfill extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? ''
    }
  }
  ;(window as unknown as { PointerEvent: unknown }).PointerEvent = Polyfill
  ;(globalThis as unknown as { PointerEvent: unknown }).PointerEvent = Polyfill
}

// jsdom polyfill: Element.prototype.scrollIntoView (used by Radix focus management)
if (typeof window !== 'undefined') {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || function () {}
}

// jsdom polyfill: HTMLElement.prototype.hasPointerCapture / setPointerCapture /
// releasePointerCapture (used by Radix DismissableLayer)
if (typeof window !== 'undefined' && !HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = function () { return false }
  HTMLElement.prototype.setPointerCapture = function () {}
  HTMLElement.prototype.releasePointerCapture = function () {}
}

// Storage polyfill: on Node 22+ the runtime ships a native `localStorage`
// (gated by --localstorage-file) that vitest exposes globally; on Node 25 it
// shadows jsdom's spec-complete Storage with an incomplete one missing
// `.clear()`/`.key()`, breaking every test that does `localStorage.clear()` in
// beforeEach. Install a deterministic in-memory Storage so tests never depend
// on the Node/jsdom version's storage quirks.
// Methods live on a shared prototype so tests can spy on
// `Storage.prototype.setItem` (e.g. to simulate quota errors) and have it
// affect the polyfilled instances, matching real DOM Storage semantics.
const _StoragePrototype = (typeof Storage !== 'undefined' && Storage.prototype) || ({} as any)
_StoragePrototype.clear = function (this: any): void { this._m.clear() }
_StoragePrototype.getItem = function (this: any, k: string): string | null {
  return this._m.has(k) ? this._m.get(k) : null
}
_StoragePrototype.key = function (this: any, i: number): string | null {
  return Array.from(this._m.keys())[i] ?? null
}
_StoragePrototype.removeItem = function (this: any, k: string): void { this._m.delete(k) }
_StoragePrototype.setItem = function (this: any, k: string, v: string): void { this._m.set(k, String(v)) }
function _makeStorage(): Storage {
  const inst: any = Object.create(_StoragePrototype)
  inst._m = new Map<string, string>()
  Object.defineProperty(inst, 'length', { get() { return this._m.size }, configurable: true })
  return inst as Storage
}
for (const prop of ['localStorage', 'sessionStorage'] as const) {
  const store = _makeStorage()
  for (const target of [globalThis, typeof window !== 'undefined' ? window : undefined]) {
    if (target) {
      try {
        Object.defineProperty(target, prop, { value: store, writable: true, configurable: true })
      } catch {
        // ignore — some targets lock the property; the global definition wins
      }
    }
  }
}

// jsdom polyfill: window.matchMedia (used by useTheme → useSessionPalette)
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}


// jsdom polyfill: window.confirm / window.alert / window.prompt. happy-dom does
// not implement these dialog primitives (they are `undefined`). Tests that
// exercise a confirm-gated action spy on them
// (`vi.spyOn(window, 'confirm').mockReturnValue(true)`). Under vitest 3
// `vi.spyOn` tolerated an absent property, but vitest 4 THROWS
// ("can only spy on a function. Received undefined"), so every such test broke
// on the vitest 3→4 bump. Install spec-shaped no-op defaults (confirm/prompt
// deny by default, matching a user who dismisses the dialog) so spying works
// and un-spied calls stay deterministic instead of throwing.
if (typeof window !== 'undefined') {
  if (typeof window.confirm !== 'function') {
    ;(window as unknown as { confirm: (m?: string) => boolean }).confirm = () => false
  }
  if (typeof window.alert !== 'function') {
    ;(window as unknown as { alert: (m?: string) => void }).alert = () => {}
  }
  if (typeof window.prompt !== 'function') {
    ;(window as unknown as { prompt: (m?: string, d?: string) => string | null }).prompt = () => null
  }
}


// jsdom polyfill: EventSource. jsdom doesn't implement the SSE Web API; the
// useFileWatch hook opens an EventSource. Provide a
// minimal no-op stub so any component that opens a stream doesn't crash under
// test. Tests that need to drive SSE events install their own richer per-test
// mock, which overrides this stub.
if (typeof (globalThis as unknown as { EventSource?: unknown }).EventSource === 'undefined') {
  class StubEventSource {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSED = 2
    url: string
    readyState = 0
    onmessage: ((ev: MessageEvent) => void) | null = null
    onerror: ((ev: Event) => void) | null = null
    onopen: ((ev: Event) => void) | null = null
    constructor(url: string) { this.url = url }
    close() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return false }
  }
  ;(globalThis as unknown as { EventSource: unknown }).EventSource = StubEventSource
}

// WebSocket stub. useWebSocket opens `ws://<host>/api/ws` on mount. jsdom has no
// WebSocket so the connect was a silent no-op under test; happy-dom SHIPS a
// native WebSocket that opens a REAL TCP socket to localhost, producing
// ECONNREFUSED spam and — worse — an unclean libuv socket teardown that crashes
// the fork worker (ERR_IPC_CHANNEL_CLOSED) at pool shutdown. Install a no-op
// stub UNCONDITIONALLY (replacing happy-dom's native class) so no test dials a
// real socket. Tests that drive WS events install their own richer per-test mock
// via vi.stubGlobal('WebSocket', …) / vi.mock('../hooks/useWebSocket'), which
// overrides this.
if (typeof window !== 'undefined') {
  class StubWebSocket {
    static readonly CONNECTING = 0
    static readonly OPEN = 1
    static readonly CLOSING = 2
    static readonly CLOSED = 3
    readonly CONNECTING = 0
    readonly OPEN = 1
    readonly CLOSING = 2
    readonly CLOSED = 3
    url: string
    readyState = 0
    onopen: ((ev: Event) => void) | null = null
    onmessage: ((ev: MessageEvent) => void) | null = null
    onerror: ((ev: Event) => void) | null = null
    onclose: ((ev: CloseEvent) => void) | null = null
    constructor(url: string) { this.url = url }
    send() {}
    close() { this.readyState = 3 }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return false }
  }
  ;(window as unknown as { WebSocket: unknown }).WebSocket = StubWebSocket
  ;(globalThis as unknown as { WebSocket: unknown }).WebSocket = StubWebSocket
}

// jsdom polyfill: HTMLCanvasElement.getContext (used by scene canvases)
// jsdom doesn't implement canvas — mock getContext to return a no-op 2d context
const _origGetContext = HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = function (type: string) {
  if (type === '2d') {
    const noop = () => {}
    const store: Record<string, any> = {}
    // `measureText` must answer a TextMetrics-shaped object, not undefined:
    // Pierre's editor measures its monospace cell on mount
    // (`Metrics.canvasMeasureTextWidth` -> `.width`) and a no-op return throws an
    // UNHANDLED error after the test that mounted it has already passed, which
    // fails the run without failing any test. Width is a plausible monospace
    // approximation -- no assertion depends on the value, only on it existing.
    const measureText = (text: string) => ({ width: String(text ?? '').length * 7 })
    return new Proxy(store, {
      get: (_t, p) => (p === 'measureText' ? measureText : p in store ? store[p] : noop),
      set: (_t, p, v) => { store[p as string] = v; return true },
    }) as any
  }
  return _origGetContext.call(this, type) as any
}


URL.createObjectURL = (() => 'blob:mock') as typeof URL.createObjectURL
URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL

// No test reaches the network. happy-dom performs real I/O for a `fetch` of a
// relative URL (an imported asset's path, say) against its default origin, which
// Kiro Crew's suite answers through its msw layer. Here the base `fetch` answers
// every request with an empty 404; a test that needs answers stubs `fetch` itself
// (`vi.stubGlobal`), and `vi.unstubAllGlobals()` comes back to this one.
globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch
