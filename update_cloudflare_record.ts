import dotenv from "dotenv"
import dig from "node-dig-dns"
import nodemailer from "nodemailer"

dotenv.config()

const API_TOKEN = process.env.API_TOKEN
const ZONE_ID = process.env.ZONE_ID
const RECORD_ID = process.env.RECORD_ID

const RECORD_NAME = process.env.RECORD_NAME
const RECORD_TYPE = process.env.RECORD_TYPE

if (!API_TOKEN || !ZONE_ID || !RECORD_ID || !RECORD_NAME || !RECORD_TYPE) {
    throw Error("Please set the required environment varibale")
}

let errors = 0
let lastResponse = undefined

const lookup = async () => {
    return dig(['@resolver4.opendns.com', 'myip.opendns.com', '+short'])
}

const updateRecord = async () => {
    const ip = await lookup()

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

const sleep = (time) => {
    return new Promise(resolve => setTimeout(resolve, time))
}

while(true) {
    errors += (await updateRecord()) ? 0 : 1

    if(errors > 2){
        break
    }

    await sleep(10_000) // 10min
}

const emailUser = process.env.MAIL_USER
const emailPass = process.env.MAIL_PASSWORD

if (emailUser && emailPass) {

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
        subject: "DynamicDNS update error",
        text: `The script has been interrupted.\n${JSON.stringify(lastResponse)}`,
    });
}


