// This is the main Node.js source code file of your actor.
// It is referenced from the "scripts" section of the package.json file,
// so that it can be started by running "npm start".

// Include Apify SDK. For more information, see https://sdk.apify.com/
const Apify = require('apify');

Apify.main(async() => {
    // Get input of the actor (here only for demonstration purposes).
    // If you'd like to have your input checked and have Apify display
    // a user interface for it, add INPUT_SCHEMA.json file to your actor.
    // For more information, see https://apify.com/docs/actor/input-schema

    const products = []
    const input = await Apify.getInput();
    const dataset = await Apify.openDataset('onthemarket')

    console.log('Input:');
    console.dir(input);

    const sources = input.data.location.map(el => { return { url: `https://www.onthemarket.com/agents/${el}` } })
    console.log(sources)
        // Open a request queue and add a start URL to it
    const requestList = new Apify.RequestList({
        sources: sources,
    });
    await requestList.initialize();
    const requestQueue = await Apify.openRequestQueue();

    const handlePageFunction = async({ request, page }) => {
        if (request.userData.detail) {
            const agent = await page.evaluate((input) => {
                const getText = (el) => {
                    if (el) {
                        return el.innerText.trim().split("\n").join(' ')
                    } else {
                        return ''
                    }
                }

                const result = {}

                result.website = new URL(document.querySelector(input.config.selector.agent_website).getAttribute('href')).searchParams.get('redirect-url')
                result.description = getText(document.querySelector(input.config.selector.agent_description))
                result.properties = []
                document.querySelectorAll(input.config.selector.agent_recent_properties.list).forEach((el) => {
                    let property = {}
                    property.title = getText(el.querySelector(input.config.selector.agent_recent_properties.title))
                    property.url = input.config.urls.home + el.querySelector(input.config.selector.agent_recent_properties.url).getAttribute('href')
                    property.address = getText(el.querySelector(input.config.selector.agent_recent_properties.address))
                    property.price = getText(el.querySelector(input.config.selector.agent_recent_properties.price))
                    result.properties.push(property)
                })
                return result
            }, input)
            products.push({...agent, ...request.userData.agent })
            await dataset.pushData({...agent, ...request.userData.agent });

        } else {

            const agents = await page.evaluate((input) => {
                const getText = (el) => {
                    if (el) {
                        return el.innerText.trim().split("\n").join(' ')
                    } else {
                        return ''
                    }
                }
                const getAttribute = (el, attrs) => {
                    if (el) {
                        return el.getAttribute(attrs)
                    } else {
                        return ''
                    }
                }
                const results = [];
                document.querySelectorAll(input.config.selector.list).forEach(async(el) => {
                    const tmpAgent = {}
                    tmpAgent.url = input.config.urls.home + el.querySelector(input.config.selector.agent_url).getAttribute('href')
                    tmpAgent.name = getText(el.querySelector(input.config.selector.agent_name))
                    tmpAgent.logo = el.querySelector(input.config.selector.agent_logo).getAttribute('src')
                    tmpAgent.address = getText(el.querySelector(input.config.selector.agent_address))
                    tmpAgent.phone = getText(el.querySelector(input.config.selector.agent_phone))
                    tmpAgent.for_sales_link = getAttribute(el.querySelector(input.config.selector.for_sales), 'href')
                    tmpAgent.to_rents_link = getAttribute(el.querySelector(input.config.selector.to_rents), 'href')
                    results.push(tmpAgent)
                })
                return results
            }, input)

            agents.forEach(async(el) => {
                await requestQueue.addRequest({
                    url: el.url,
                    userData: {
                        detail: true,
                        agent: el
                    }
                })
            })

            const next_page = await page.evaluate((input) => {
                return input.config.urls.home + document.querySelector(input.config.selector.next_page).getAttribute('href')
            }, input)

            if (next_page) {
                await requestQueue.addRequest({
                    url: next_page,
                    userData: {
                        detail: false
                    }
                })
            }

        }
    };
    const handleFailedRequestFunction = async({ request }) => {
        console.log(`Request ${request.url} failed too many times`);
        await dataset.pushData({
            '#debug': Apify.utils.createRequestDebugInfo(request),
        });
    };
    // Create a crawler that will use headless Chrome / Puppeteer to extract data
    // from pages and recursively add links to newly-found pages
    const crawler = new Apify.PuppeteerCrawler({
        requestList,
        requestQueue,
        handlePageFunction,
        handleFailedRequestFunction,
        maxRequestRetries: 2,
        maxRequestsPerCrawl: 100,
        maxConcurrency: 10,
        launchPuppeteerOptions: {
            useChrome: true,
            headless: false
        },

    });

    await crawler.run();
    await Apify.setValue('OUTPUT', products);
});