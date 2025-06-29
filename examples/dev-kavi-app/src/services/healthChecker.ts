import fs from 'fs'
import { HandlerDecorations, Lifecycle, ReqRef, ReqRefDefaults, Request, ResponseObject, ResponseToolkit } from '@hapi/hapi';
import { KaviServerRoute } from '@kavi/server';

export const defaultPage = `
<!DOCTYPE>
<html>

<head>
    <meta charset="utf-8">
    <title>HealthCheck</title>
    <style>
        * {
            font-family: system-ui;
        }

        body {
            background: lightgrey;
        }

        h1 {
            margin: 40px 0;
            text-align: center;
            text-decoration: underline;
        }

        table {
            min-width: 50%;
            margin: auto;
            border-collapse: collapse;
        }

        th {
            text-align: center;
            color: white;
            background: #36304a;
        }

        th:first-child {
            border-top-left-radius: 10px;
        }

        th:last-child {
            border-top-right-radius: 10px;
        }

        tr:last-child td:first-child {
            border-bottom-left-radius: 10px;
        }

        tr:last-child td:last-child {
            border-bottom-right-radius: 10px;
        }

        td,
        th {
            height: 50px;
            padding: 8px 20px;
        }

        td {
            color: #555555;
            text-align: center;
        }

        td.right {
            text-align: right;
        }

        td.bold {
            font-weight: bold;
        }

        tr {
            background-color: white;
        }

        tr:nth-child(odd) {
            background-color: #f5f5f5;
        }
    </style>
</head>

<body>
    <h1>HealthCheck</h1>
    <table id="table">
        <tr>
            <th>Service name</th>
            <th>Uptime</th>
            <th>Info</th>
        </tr>
    </table>
    <script type="text/javascript">
        var SERVICE = "%SERVICE%";
        var HEALTHCHECK_PATH = "%HEALTH_CHECK_PATH%";
        var services = {};
        var drawing = Date.now();
        services[SERVICE] = 'Loading';

        var table = document.getElementById('table');

        if (HEALTHCHECK_PATH.indexOf('%') > -1) {
            HEALTHCHECK_PATH = ''
        }

        try {
            var request = new XMLHttpRequest();
            request.open("GET", HEALTHCHECK_PATH + '/_healthCheck/' + SERVICE, false);
            request.addEventListener("load", dataReceived(SERVICE));
            request.addEventListener("error", error(SERVICE));
            request.send();
        } catch (e) {
            error(SERVICE)(e);
        }

        function dataReceived(service) {
            return function () {
                var data;
                try {
                    data = JSON.parse(this.responseText);
                } catch (e) {
                    return error(service)(this.responseText);
                }
                if (!data || data.error) return error(service)(data.error);
                services[service] = data;
                draw();
            }
        }
        function error(serv) {
            return function (e) {
                services[serv] = e.toString();
                draw();
            }
        }
        function draw() {
            var curdrawing = Date.now();
            drawing = curdrawing;

            var prev = document.getElementsByClassName('appended');
            while (prev.length) {
                prev.item(0).remove();
            }

            Object.keys(services)
                .sort()
                .forEach(function (serv) {
                    if (drawing != curdrawing) return;
                    var row = table.insertRow();
                    row.className = 'appended';

                    // service name
                    var serviceName = row.insertCell();
                    serviceName.className = 'bold';
                    serviceName.title = HEALTHCHECK_PATH + '/_healthCheck/' + serv;
                    serviceName.ondblclick = function () {
                        window.open(this.title, '_tab');
                    }
                    serviceName.style.color = 'green';


                    // uptime
                    var uptime = row.insertCell();

                    // info
                    var info = row.insertCell();

                    write(serviceName, serv);
                    write(uptime, toTime(services[serv].uptime));
                    if (services[serv].info) {
                        write(info, jsonToString(services[serv].info));
                    }
                });
        }
        function write(cell, text) {
            var newText = document.createTextNode(text || '?');
            cell.appendChild(newText);
        }
        function toTime(ms) {
            if (!Number.isInteger(ms)) return ms;
            var count = { d: 0, h: 0, m: 0, s: 0 };
            var value = {
                d: 24 * 60 * 60000,
                h: 60 * 60000,
                m: 60000,
                s: 1000
            }
            while (ms >= value.d) { count.d++; ms -= value.d; }
            while (ms >= value.h) { count.h++; ms -= value.h; }
            while (ms >= value.m) { count.m++; ms -= value.m; }
            count.s = ms / 1000;
            var out = '';
            if (count.d) out += count.d + 'd ';
            if (count.h) out += count.h + 'h ';
            if (count.m) out += count.m + 'm ';
            if (count.s) out += count.s + 's';
            return out;
        }
        function jsonToString(value) {
            return JSON.stringify(value)
        }
    </script>
</body>

</html>
`

export class HealthChecker {

    #pageFile: string = ''
    #cachedPage: string = ''
    #compiledFunction: ((data: Record<string, unknown>) => string) | null = null

    protected service: string
    protected healthCheckPath: string
    protected data: Record<string, unknown> = {}
    protected timestamp: number

    get uptime() {
        return Date.now() - this.timestamp
    }

    constructor(serviceName: string, healthCheckPath: string = '') {
        this.healthCheckPath = healthCheckPath
        this.service = serviceName
        this.timestamp = Date.now()
    }

    setData(data: Record<string, unknown>) {
        this.data = { ...data }
    }

    addData(key: string, value: unknown) {
        this.data[key] = value
    }

    clearData() {
        this.data = {}
        return this;
    }

    clearCache() {
        this.#cachedPage = ''
        this.#compiledFunction = null
        return this;
    }

    setPageFile(filepath: string) {
        this.#pageFile = filepath
    }

    async generatePage() {
        if (!this.#compiledFunction) {
            try {
                if (!this.#cachedPage) {
                    if (this.#pageFile) {
                        this.#cachedPage = await fs.promises.readFile(this.#pageFile, 'utf-8')
                    } else {
                        this.#cachedPage = defaultPage
                    }
                    this.#cachedPage = this.#cachedPage.replace(/%SERVICE%/g, this.service)
                    if (this.healthCheckPath) {
                        this.#cachedPage = this.#cachedPage.replace(/%HEALTH_CHECK_PATH%/g, this.healthCheckPath)
                    }
                }

                this.#compiledFunction = (data: Record<string, unknown>) => {
                    let content = this.#cachedPage
                    for (const key in data) {
                        if (!['SERVICE', 'HEALTH_CHECK_PATH'].includes(key))
                            content = content.replace(new RegExp(`%${key}%`, 'g'), `${data[key]}`)
                    }
                    return content
                }
            } catch (err) {
                console.log(err)
            }
        }
        return this.#compiledFunction?.(this.data) || this.#cachedPage
    }

    async generateJSON(info: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
        return info
    }

    async render<Refs extends ReqRef = ReqRefDefaults>(_: Request<Refs>, h: ResponseToolkit<Refs>): Promise<ResponseObject> {
        return h.response(await this.generatePage()).header('Content-Type', 'text/html');
    }

    /**
     * Adds routes "/_healthCheck", "<healthCheckPath>/_healthCheck" and "<healthCheckPath>/_healthCheck/<serviceName>"
     */
    register<Refs extends ReqRef = ReqRefDefaults>(
        method: (serverRoute: KaviServerRoute, handler: HandlerDecorations | Lifecycle.Method<Refs, Lifecycle.ReturnValue<Refs>>) => unknown,
        serviceInfo: Record<string, unknown> = {}
    ) {
        method({
            method: 'GET',
            path: '/_healthCheck',
            options: {
                description: '__GLOBAL__',
                tags: ['HealthChecks']
            },
        }, this.render.bind(this))
        method({
            method: 'GET',
            path: this.healthCheckPath + '/_healthCheck',
            options: {
                description: '__GLOBAL__',
                tags: ['HealthChecks']
            },
        }, this.render.bind(this))
        if (this.service) {
            method({
                method: 'GET',
                path: this.healthCheckPath + '/_healthCheck/' + this.service,
                options: {
                    description: '__GLOBAL__',
                    tags: ['HealthChecks']
                },
            }, async (_req, h) => {
                return h.response({ uptime: this.uptime, info: await this.generateJSON({ ...serviceInfo }) }).header('Content-Type', 'application/json');
            })
        }
    }
}
