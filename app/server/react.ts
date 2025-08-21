export function getName(input: string) {
    "use server"
    return `Hello ${input}`
}

export function getServerTime() {
    "use server"
    return new Date().toISOString()
}