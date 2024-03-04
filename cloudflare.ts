let _apiToken = ""
let configured = false

const config = (apiToken?: string) => {
    _apiToken = apiToken || process.env.CLOUDFLARE_API_TOKEN
    configured = true
}

const checkConfig = () => {
    if(!configured) throw Error("Module not configured.")
}

const defaultHeader = () : HeadersInit => {
    return [
        ["Content-Type", "application/json"],
        ["Authorization", `Bearer ${_apiToken}`]
    ]
}

interface UpdateDnsRecordBody {
    content: string;
    name: string;
    proxied?: boolean;
    type: string;
    comment?: string;
    tags?: [string];
    ttl?: number;
}

interface Record {
    content: string;
    name: string;
    proxied?: boolean;
    comment?: string;
    created_on: string;
    id: string;
    locked: boolean;
    meta?: {auto_added?: boolean, source?: string};
    modified_on: string;
    proxiable: boolean;
    tags?: [string];
    ttl?: number;
    zone_id?: string;
    zone_name: string;
}


export interface UpdateDnsRecordResponse {
    result: Record;
    errors: [{code: number, message: string}];
    messages: [{code: number, message: string}];
    success: boolean;
}

const updateDnsRecord = (zondeId, recordId, body: UpdateDnsRecordBody) => {
    checkConfig()

    const url = `https://api.cloudflare.com/client/v4/zones/${zondeId}/dns_records/${recordId}`
    
    const request = new Request(url, {
        method: 'PATCH',
        headers: defaultHeader(),
        body: JSON.stringify(body)
    })

    return new Promise(async (resolve: (value: UpdateDnsRecordResponse) => void, reject) => {
        try {
            const response = await fetch(request)
            resolve(await response.json())
        }
        catch (error) {
            reject(error)
        }
    })
}


export default {config, updateDnsRecord}