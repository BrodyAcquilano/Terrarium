import { useEffect } from 'react'
import markup from './markup.html?raw'
import './terrarium.css'

// The terrarium page was originally built as one self-contained HTML file.
// Its markup lives in markup.html, its styles in terrarium.css, and its six
// behaviour scripts (tabs, simulations, canvas graphs) in
// public/terrarium-scripts.js, which is loaded once after the markup mounts.
export default function App() {
  useEffect(() => {
    if (document.querySelector('script[data-terrarium-scripts]')) return
    const s = document.createElement('script')
    s.src = '/terrarium-scripts.js'
    s.dataset.terrariumScripts = 'true'
    document.body.appendChild(s)
  }, [])

  return <div dangerouslySetInnerHTML={{ __html: markup }} />
}
