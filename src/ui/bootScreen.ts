/**
 * Drives the loading screen that index.html ships as plain HTML (so it is visible
 * before this code has even downloaded).
 */
import { LOADING_TIPS } from '../config/strings'

const element = (id: string) => document.getElementById(id)

let tipTimer: number | undefined
let tipIndex = Math.floor(Math.random() * LOADING_TIPS.length)

function showTip(): void {
  const tip = element('boot-tip')
  if (tip) tip.textContent = LOADING_TIPS[tipIndex++ % LOADING_TIPS.length]
}

export function startBootTips(): void {
  if (tipTimer !== undefined) return
  showTip()
  tipTimer = window.setInterval(showTip, 4200)
}

export function setBootProgress(value: number, label: string): void {
  const bar = element('boot-bar')
  if (bar) bar.style.width = `${Math.round(Math.max(0.04, Math.min(1, value)) * 100)}%`
  const status = element('boot-status')
  if (status && label) status.textContent = label
}

export function showBootError(message: string, onRetry: () => void): void {
  const boot = element('boot')
  if (!boot) return
  boot.classList.add('boot--error')
  setBootProgress(1, 'Something went wrong')
  const tip = element('boot-tip')
  if (tip) tip.textContent = message
  window.clearInterval(tipTimer)
  tipTimer = undefined
  if (!boot.querySelector('.boot__retry')) {
    const button = document.createElement('button')
    button.className = 'boot__retry'
    button.textContent = 'Try again'
    button.onclick = () => {
      button.remove()
      boot.classList.remove('boot--error')
      onRetry()
    }
    boot.querySelector('.boot__inner')?.append(button)
  }
}

export function hideBoot(): void {
  const boot = element('boot')
  if (!boot) return
  window.clearInterval(tipTimer)
  tipTimer = undefined
  boot.classList.add('boot--done')
  window.setTimeout(() => boot.remove(), 700)
}
