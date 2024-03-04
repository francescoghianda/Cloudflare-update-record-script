import Bun from 'bun'
import updateService from './UpdateRecordService';
import { sendEmailAlert } from './utils';

const server = Bun.serve({
    port: 3000,
    fetch(request) {

        const path = new URL(request.url).pathname;
        const serviceData = updateService.serviceData()

        if (path === '/status') {

            const body = {
                status: (!serviceData.lastResponse || serviceData.lastResponse.success) ? 'ok' : 'error',
                data: {
                    running: serviceData.running,
                    lastResponse: serviceData.lastResponse,
                    lastIp: serviceData.lastIp,
                    lastSuccessfulUpdate: serviceData.lastSuccessfulUpdate,
                    lastUpdateSkipped: serviceData.lastUpdateSkipped,
                    logs: serviceData.logHistory,
                }
            }
            return Response.json(body)
        }

        if (path === '/start-service') {
            if (serviceData.running) {
                return new Response('Service already running.')
            }
            updateService.startService().then((unexpectedStop) => {
                if (unexpectedStop) {
                    const serviceData = updateService.serviceData() 
                    sendEmailAlert('DynamicDNS update error', `The script has been interrupted.\nLast ip = ${serviceData.lastIp}\nLast resposnse:\n${JSON.stringify(serviceData.lastResponse)}`)
                }
            })
            return new Response('Service started.')
        }

        if (path === '/stop-service') {
            if (!serviceData.running) {
                return new Response('Service alredy stopped.')
            }
            updateService.stopService()
            return new Response('Service stopped')
        }

        return new Response(null, {status: 404});
    },
});
