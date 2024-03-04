import dig from "node-dig-dns"
import nodemailer from "nodemailer"

type LogLevel = "info" | "warn" | "error"

export let logHistory: {date: Date, level: LogLevel, message: string}[] = []

export const log = (message: string, level: LogLevel = "info") => {
    const d = new Date()
    const h = new Intl.DateTimeFormat(undefined, {hour: '2-digit', minute: '2-digit', hour12: false}).format(d)
    const m = `[${h}] ${message}`

    const l = {
        date: d,
        level: level,
        message: message
    }

    logHistory.push(l)

    if (logHistory.length > 30) {
        logHistory = logHistory.splice(0, 1)
    }

    console[level](m)
}

export class LookupError implements Error {

    name: string
    message: string
    stack?: string | undefined

    constructor(message?: string) {
        this.name = "Lookup error"
        this.message = message ?? ""
    }
}

export class NetworkError implements Error {

    name: string
    message: string
    stack?: string | undefined

    constructor(message?: string) {
        this.name = "Network error"
        this.message = message ?? ""
    }
}

const isValidIPv4 = (ip: string) => {
    const ipv4RegEx = /^(\d{1,3}\.){3}\d{1,3}$/
    return ipv4RegEx.test(ip)
}

export const lookup = async () => {

    const ip: string = await dig(['@resolver4.opendns.com', 'myip.opendns.com', '+short'])

    if (isValidIPv4(ip)) {
        return ip
    }
    
    throw new LookupError()
}

export const sendEmailAlert = async (subject, text) => {
    const emailUser = process.env.MAIL_USER
    const emailPass = process.env.MAIL_PASSWORD

    if (!(emailUser && emailPass)) {
        console.warn("Email service not configured.")
        return
    }

    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
                user: emailUser,
                pass: emailPass,
            },
        });
    
        await transporter.sendMail({
            from: "francy9661@gmail.com",
            to: "francesco.ghianda@outlook.com",
            subject: subject,
            text: text,
        });
    }
    catch (error) {
        console.error(error.name, error.message)
    }
}