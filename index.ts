import Bun from 'bun'
import updateService from './RecordUpdater';
import { sendEmailAlert } from './utils';

const server = Bun.serve({
    port: process.env.PORT || 3000,
    fetch(request) {

        const url = new URL(request.url)
        const path = url.pathname
        const params = url.searchParams
        const serviceData = updateService.serviceData()

        if (path === '/status') {

            /*const body = {
                status: (!serviceData.lastResponse || serviceData.lastResponse.success) ? 'ok' : 'error',
                data: {
                    running: serviceData.running,
                    lastResponse: serviceData.lastResponse,
                    lastIp: serviceData.lastIp,
                    lastSuccessfulUpdate: serviceData.lastSuccessfulUpdate,
                    lastUpdateSkipped: serviceData.lastUpdateSkipped,
                    logs: serviceData.logHistory,
                }
            }*/
            
            return Response.json(serviceData)
        }

        if (path === '/start-service') {
            if (serviceData.status === "running") {
                return new Response('Service already running.')
            }
            updateService.start()
            return new Response('Service started.')
        }

        if (path === '/stop-service') {
            if (serviceData.status !== "running") {
                return new Response('Service alredy stopped.')
            }
            updateService.stop()
            return new Response('Service stopped.')
        }

        if (path === '/update') {
            const force = params.has('force')
            updateService.updateSync()
            return new Response('Update requested.')
        }

        return new Response(null, {status: 404});
    },
});

/*const startService = () => {
    updateService.startService().then((unexpectedStop) => {
        if (unexpectedStop) {
            const serviceData = updateService.serviceData() 
            sendEmailAlert('DynamicDNS update error', `The script has been interrupted.\nLast ip = ${serviceData.lastIp}\nLast resposnse:\n${JSON.stringify(serviceData.lastResponse)}`)
        }
    })
}*/
updateService.onStop = (unexpectedStop) => {
    if (unexpectedStop) {
        const serviceData = updateService.serviceData() 
        sendEmailAlert('DynamicDNS update error', `The script has been interrupted.\nLast ip = ${serviceData.lastResult.ip}\nLast resposnse:\n${JSON.stringify(serviceData.lastResult.apiResponse)}`)
    }
}

updateService.start() // Automatically start the service on startup
