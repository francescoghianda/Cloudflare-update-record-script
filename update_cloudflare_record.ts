import dotenv from "dotenv"
import dig from "node-dig-dns"
import nodemailer from "nodemailer"

class LookupError implements Error {

    name: string
    message: string
    stack?: string | undefined

    constructor(message?: string) {
        this.name = "Lookup error"
        this.message = message ?? ""
    }
}

class NetworkError implements Error {

    name: string
    message: string
    stack?: string | undefined

    constructor(message?: string) {
        this.name = "Network error"
        this.message = message ?? ""
    }
}

dotenv.config()

const API_TOKEN = process.env.API_TOKEN
const ZONE_ID = process.env.ZONE_ID
const RECORD_ID = process.env.RECORD_ID

const RECORD_NAME = process.env.RECORD_NAME
const RECORD_TYPE = process.env.RECORD_TYPE

const emailUser = process.env.MAIL_USER
const emailPass = process.env.MAIL_PASSWORD

if (!API_TOKEN || !ZONE_ID || !RECORD_ID || !RECORD_NAME || !RECORD_TYPE) {
    throw Error("Please set the required environment varibale")
}

const ipv4RegEx = /^(\d{1,3}\.){3}\d{1,3}$/
let errors = 0
let lastResponse = undefined
let lastIp = ""

const sendEmailAlert = async (subject, text) => {
    if (emailUser && emailPass) {

        try {
            const transporter = nodemailer.createTransport({
                servive: "gmail",
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
            console.log("Error sending email")
        }
    }
    else {
        console.log("No email configured")
    }
}

const lookup = async () => {

    const ip: string = await dig(['@resolver4.opendns.com', 'myip.opendns.com', '+short'])

    if (ipv4RegEx.test(ip)) {
        return ip
    }
    
    throw new LookupError()
}

const updateRecord = async () => {

    try {
        const ip = await lookup()

        if (ip === lastIp) return true
        lastIp = ip

        const requestBody = {
            content: ip,
            name: RECORD_NAME,
            type: RECORD_TYPE
        }
    
        const url = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${RECORD_ID}`
    
        const request = new Request(url, {
            method: 'PUT',
            headers: [
                ["Content-Type", "application/json"],
                ["Authorization", `Bearer ${API_TOKEN}`]
            ],
            body: JSON.stringify(requestBody)
        })
        
        const response = await (await fetch(request)).json()
        lastResponse = response
    
        return response.success
        
    }
    catch(error) {
        if (error instanceof LookupError) {
            console.log("Lookup error")
        }
        else {
            console.log("Fetch error")
        }

        throw new NetworkError()
    }

}

const sleep = (time) => {
    return new Promise(resolve => setTimeout(resolve, time))
}

let networkErrors = 0

while(true) {
    try {
        const success = await updateRecord();

        networkErrors = 0

        if (!success){
            console.log("API Error");
            errors++
            if (errors > 2) {
                console.log("Abort")
                break
            }

            console.log("Retry in 2min")
            await sleep(2 * 60 * 1000)
            continue
        }

        errors = 0

        console.log("Record updated successfully.")
        console.log("Next update in 10min")
        await sleep(10 * 60 * 1000) // 10min
    }
    catch(error) {
        if (error instanceof NetworkError) {
            networkErrors++

            if (networkErrors > 1) {
                sendEmailAlert('Possible network problems', 'The script was paused. The next try will be in 30min')
                console.log('Retry in 30min')
                await sleep(30 * 60 * 1000)
            }
            else {
                console.log("Retry")
            }
        }
        else {
            console.log("Error: ", error.name)
            console.log("Retry")
        }

    }
}

sendEmailAlert('DynamicDNS update error', `The script has been interrupted.\nLast ip = ${lastIp}\nLast resposnse:\n${JSON.stringify(lastResponse)}`)
