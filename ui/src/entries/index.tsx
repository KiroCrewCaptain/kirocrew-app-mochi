/**
 * The dashboard page (`ui.entry`): Mochi's status, watch list, plan, memories
 * and pinned files, the built-in's `/mochi` page.
 */
import { useAppApi, useLanguageGeneration } from '@kirocrew/app-sdk'
import MochiPage from '../MochiPage'
import { setTransport } from '../host/appFetch'

export default function MochiRoot() {
  // Set during render so the page's first request already goes through it.
  setTransport(useAppApi())
  useLanguageGeneration()
  return <MochiPage />
}
