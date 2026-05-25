import type { EIP1193Provider } from 'viem'

declare global {
  interface Window {
    ethereum?: EIP1193Provider & {
      on?: (event: string, handler: (...args: any[]) => void) => void
      removeListener?: (event: string, handler: (...args: any[]) => void) => void
    }
  }
}
