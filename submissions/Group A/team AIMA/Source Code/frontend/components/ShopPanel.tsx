"use client"

import { useEffect, useState } from "react"

type Product = { sku: string; name: string; price: number; image?: string }
type CartLine = { sku: string; qty: number }
type ShopState = { cart: CartLine[]; current_page: string }
type ShopResponse = { state: ShopState; products: Product[] }

const SHOP_URL = process.env.NEXT_PUBLIC_SHOP_URL || "http://localhost:8000"

export function ShopPanel() {
  const [data, setData] = useState<ShopResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchState = async () => {
      try {
        const res = await fetch(`${SHOP_URL}/shop/state`, { cache: "no-store" })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: ShopResponse = await res.json()
        if (!cancelled) {
          setData(json)
          setError(null)
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    }

    fetchState()
    const id = setInterval(fetchState, 1000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const reset = async () => {
    await fetch(`${SHOP_URL}/shop/reset`, { method: "POST" })
  }

  if (error && !data) {
    return (
      <div className="p-6 text-sm text-red-500">
        Cannot reach shop server at {SHOP_URL}
        <br />
        {error}
      </div>
    )
  }

  if (!data) {
    return <div className="p-6 text-sm text-gray-500">Loading shop…</div>
  }

  const { state, products } = data
  const productMap = Object.fromEntries(products.map((p) => [p.sku, p]))
  const total = state.cart.reduce((sum, line) => {
    const p = productMap[line.sku]
    return sum + (p ? p.price * line.qty : 0)
  }, 0)

  const ProductGrid = ({ heading }: { heading: string }) => (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
        {heading}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {products.map((p) => (
          <div
            key={p.sku}
            className="rounded-lg border p-3 transition-colors hover:border-gray-400 flex flex-col"
          >
            {p.image && (
              <div className="mb-3 aspect-square relative rounded-md overflow-hidden bg-gray-50 flex-shrink-0">
                <img src={p.image} alt={p.name} className="object-cover w-full h-full" />
              </div>
            )}
            <div className="text-sm font-medium">{p.name}</div>
            <div className="text-xs text-gray-500">{p.sku}</div>
            <div className="mt-2 text-sm">${p.price.toFixed(2)}</div>
          </div>
        ))}
      </div>
    </section>
  )

  const CartView = () =>
    state.cart.length === 0 ? (
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
          Your Cart
        </h2>
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
          Cart is empty — try saying &ldquo;add a ceramic mug to my cart&rdquo;
        </div>
      </section>
    ) : (
      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
          Your Cart
        </h2>
        <div className="rounded-lg border">
          {state.cart.map((line) => {
            const p = productMap[line.sku]
            return (
              <div
                key={line.sku}
                className="flex items-center justify-between border-b px-4 py-3 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  {p && p.image && (
                    <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-gray-50">
                      <img src={p.image} alt={p.name} className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium">{p?.name ?? line.sku}</div>
                    <div className="text-xs text-gray-500">qty {line.qty}</div>
                  </div>
                </div>
                <div className="text-sm">
                  ${((p?.price ?? 0) * line.qty).toFixed(2)}
                </div>
              </div>
            )
          })}
          <div className="flex items-center justify-between px-4 py-3 font-medium">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
        </div>
      </section>
    )

  const CheckoutView = () => (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-500">
        Checkout
      </h2>
      {state.cart.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
          Nothing to check out — your cart is empty.
        </div>
      ) : (
        <div className="rounded-lg border p-6 space-y-4">
          <div className="space-y-1 text-sm">
            {state.cart.map((line) => {
              const p = productMap[line.sku]
              return (
                <div key={line.sku} className="flex justify-between">
                  <span>
                    {p?.name ?? line.sku} × {line.qty}
                  </span>
                  <span>${((p?.price ?? 0) * line.qty).toFixed(2)}</span>
                </div>
              )
            })}
          </div>
          <div className="flex items-center justify-between border-t pt-3 text-base font-semibold">
            <span>Total</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <button
            disabled
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white opacity-60"
          >
            Place Order (demo)
          </button>
        </div>
      )}
    </section>
  )

  return (
    <div className="flex flex-col gap-6 p-6 h-full overflow-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Voice Shop</h1>
        <div className="flex items-center gap-3">
          <span className="rounded-full border px-3 py-1 text-xs uppercase tracking-wide">
            page: {state.current_page}
          </span>
          <button
            onClick={reset}
            className="rounded-md border px-3 py-1 text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            reset
          </button>
        </div>
      </div>

      {state.current_page === "home" && <ProductGrid heading="Featured" />}
      {state.current_page === "products" && <ProductGrid heading="All Products" />}
      {state.current_page === "cart" && <CartView />}
      {state.current_page === "checkout" && <CheckoutView />}
    </div>
  )
}
