import { useEffect, useRef } from 'react'

export function useInView(callback: () => void): React.RefObject<HTMLDivElement | null> {
    const ref = useRef<HTMLDivElement>(null)
    const called = useRef(false)
    const callbackRef = useRef(callback)

    useEffect(() => {
        callbackRef.current = callback
    })

    useEffect(() => {
        const el = ref.current
        if (!el) return

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting && !called.current) {
                    called.current = true
                    callbackRef.current()
                }
            },
            { threshold: 0.5 }
        )

        observer.observe(el)
        return () => observer.disconnect()
    }, [])

    return ref
}
