'use strict';

const fetch = require('node-fetch');

// Same methods for calling APIs and passing them to OpenAI Chat. ChatGPT detects the scenarios described in description, i.e. "Get the current weather in a given location"

/**
 * Sample method for returning current weather of specific location. Get API key from https://weather.visualcrossing.com and replace in API_KEY
 * For bacground image changes, register with https://api.unsplash.com/, get their API key and replace with BACK_API_KEY
 * In Video AI section in the dashboard in the advanced section, for the getCurrentWeather sample function to work, fill in in "Name of the function" getCurrentWeather, 
 * "Description" - "Get the current weather in a given location" and parameters - location,unit
 * The ChatGPT detects a location and passes it to this method defined in the schema. Ask for example: "Weather in New York"
 * @param {*} arg
 * @returns {string} weather forecast for a location.
 */

async function getCurrentWeather(arg) {
    const date = new Date();
    const formattedDate = date.toISOString().split('T')[0].replace(/-/g, '-');
    const response = await fetch('https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/' + arg.location + '/' + formattedDate + '/' + formattedDate + '?key=API_KEY', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    let resp = '';
    const data = await response.json();
    if (arg.unit && arg.unit === 'fahrenheit') {
        resp = data.currentConditions.temp + ' degrees in Fahrenheit';
    } else {
        resp = Math.round((data.currentConditions.temp +  - 32) / 1.8, 1) + ' degrees in Celsius';
    }
    let condition = data.currentConditions.conditions;



    const api_url = 'https://api.unsplash.com/search/photos?client_id=BACK_API_KEY&order_by=relevant&query=' + arg.location + '&orientation=landscape&per_page=1';
    const responseBack = await fetch(api_url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    const back = await responseBack.json();
    const backgroundImage = back['results'][0]['urls']['regular'];

    return {'text': 'Current weather condition in ' + arg.location + ' is ' + condition + ' with temperature of ' + resp, 'background': backgroundImage};
}

/**
 * Sample method for price of stocks from finance yahoo.
 * In Video AI section in the dashboard in the advanced section, fill in in "Name of the function" getPrice,
 * "Description" - "Get the current price for a stock" and parameters - symbol
 * The ChatGPT detects if you are asking for a price and returns it, i.e. "What is the price of crude oil"
 * @param {*} arg
 * @returns {string} Price of a stock
 */

async function getPrice(arg) {
    const response = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + arg.symbol + '?region=US&lang=en-US&includePrePost=false&interval=1h&useYfid=true&range=1d', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    const data = await response.json();

    if (data) {
        if (data['chart']['result'][0]['meta']['regularMarketPrice']) {
            return {'text': 'Current price of ' + arg.symbol + ' is ' + data['chart']['result'][0]['meta']['regularMarketPrice'] + ' USD.'};
        } else {
            return {'text': 'Sorry, cannot provide price for ' + arg.symbol};
        }
    } else {
        return {'text': 'Symbol is not recognised, please provide more specific info.'};
    }
}

/**
 * Sample method for converting currency to USD. You need to get API key from https://exchangerate-api.com and replace it with API_KEY
 * In Video AI section in the dashboard in the advanced section, fill in in "Name of the function" getCurrency,
 * "Description" - "Get currency conversion" and parameters - currency,quantity
 * The ChatGPT detects if you are asking for a currency conversion and returns it, i.e. "Convert me 100 euros please"
 * @param {*} arg
 * @returns {string} Price of a stock
 */

async function getCurrency(arg) {
    const response = await fetch('https://v6.exchangerate-api.com/v6/API_KEY/latest/USD', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    const data = await response.json();
    const quantity = arg.quantity || 1;
    const currency = arg.currency;

    if ('success' === data.result) {
        const number = quantity / data.conversion_rates[currency];
        const price = Math.round((number + Number.EPSILON) * 100) / 100;
        return {'text': 'Currency conversion of ' + quantity + ' ' + currency + ' is ' + price + ' USD'};
    } else  {
        return {'text': 'Sorry, cannot provide conversion for ' . currency};
    }
}

/**
 * Sample for getting hotel information from TravelPayouts hotel data API. Create an account from https://app.travelpayouts.com, get your API token and replace it with API_KEY in the code.
 * For bacground image changes, register with https://api.unsplash.com/, get their API key and replace with BACK_API_KEY
 * In Video AI section in the dashboard in the advanced section, fill in "getHotel" in "Name of the function",
 * "Description" - "Get hotels in city location" and parameters - city
 * The ChatGPT detects keywords hotels and location of a city calls the TravelPayouts API and responds.
 */

async function getHotels(arg)
{
    const response = await fetch('https://engine.hotellook.com/api/v2/lookup.json?query=' + arg.city + '&lang=en&lookFor=hotel&limit=5&token=API_KEY', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    let data = await response.json();

    let answer = 'Hotels near ' + arg.city + ' are ';
    let hotels = data.results;
    hotels.hotels.forEach((value, index) => {
        let end = (index == hotels.hotels.length - 1) ? '' : ', ';
        answer += value.label + end;
    });

    const api_url = 'https://api.unsplash.com/search/photos?client_id=BACK_API_KEY&order_by=relevant&query=' + arg.location + '&orientation=landscape&per_page=1';
    const responseBack = await fetch(api_url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    const back = await responseBack.json();
    const backgroundImage = back['results'][0]['urls']['regular'];

    return {'text': answer, 'background': backgroundImage};
}

/**
 * Sample for getting news based on keywords from https://newsapi.ai/ data API. Create an account from https://newsapi.ai/, get your API token and replace it with API_KEY in the code.
 * For bacground image changes, register with https://api.unsplash.com/, get their API key and replace with BACK_API_KEY
 * In Video AI section in the dashboard in the advanced section, fill in "getNews" in "Name of the function",
 * "Description" - "Get latest news by keywords" and parameters - keywords
 * The ChatGPT detects the request and based on the keywords calls NewsApi API and responds.
 */

async function getNews(arg)
{
    const date = new Date();
    const formattedDate = date.toISOString().split('T')[0].replace(/-/g, '-');
    const response = await fetch('https://eventregistry.org/api/v1/article/getArticles?action=getArticles&keyword=' + arg.keywords + '&dateStart=' + formattedDate + '&lang=eng&articlesCount=10&articlesSortBy=date&resultType=articles&&apiKey=API_KEY', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    let data = await response.json();
    let answer = '', backgroundImage = '';
    if (data && data.articles) {
        answer = 'Please open the chat and click on a news feed|';
        data.articles.results.forEach((value, index) => {
            answer += '<a href="#" onclick="sendVideoAi(\'Get detailed news title ' + value.title + ' and keywords ' + arg.keywords + ' \')">'  + value.title + '</a><hr>';
            if (index === 0) {
                backgroundImage = value.image;
            }
        });
    }

    return {'text': answer, 'background': backgroundImage};
}

/**
 * Sample for getting news body on keywords from https://eventregistry.org data API. Create an account from https://eventregistry.org, get your API token and replace it with API_KEY in the code.
 * In Video AI section in the dashboard in the advanced section, fill in "getNewsDetailed" in "Name of the function",
 * "Description" - "Get news by title and keywords" and parameters - news, keywords
 * The ChatGPT detects the request and based on the keywords calls NewsApi API and responds.
 */
async function getNewsDetailed(arg)
{
    const date = new Date();
    const formattedDate = date.toISOString().split('T')[0].replace(/-/g, '-');
    const response = await fetch('https://eventregistry.org/api/v1/article/getArticles?action=getArticles&keyword=' + arg.keywords + '&dateStart=' + formattedDate + '&lang=eng&articlesCount=10&articlesSortBy=date&resultType=articles&&apiKey=API_KEY', {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    let data = await response.json();
    let answer = '', title = '';
    if (data && data.articles) {
        data.articles.results.forEach((value, index) => {
            answer += '<a href="#" onclick="sendVideoAi(\'Get detailed news title ' + value.title + ' and keywords ' + arg.keywords + ' \')">'  + value.title + '</a><hr>';
            if (index === 0) {
                backgroundImage = value.image;
            }

            title = arg.news.substring(0, 30);
            title = art.news.substring(0, title.lastIndexOf(' '));
            if (value.title.indexOf(title)) {
                let description = value.body;
                if (description.length > 900) {
                    description = description.substring(0, 990);
                    description = description.substring(0, description.lastIndexOf('.'));
                }
                answer = description;
                return;
            }
        });
    }

    return {'text': answer};
}

/**
 * Sample function for getting available timeslots for a booking. For example a healthcare organization or a hotel availability
 * In Video AI section in the dashboard in the advanced section, fill in "getAvailableTimeslots" in "Name of the function",
 * "Description" - "Get available timeslots and free hours" and parameters - timeslot
 */
async function getAvailableTimeslots(arg)
{
    // return {'text': 'Available timeslots for tomorrow'};
    const postData = JSON.stringify({
        type: 'getavailabletimeslots'
    });
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const SERVER_URL = arg.url + 'server/script.php';

    const res = await fetch(SERVER_URL, {
        method: 'POST',
        body: postData,
        headers: {
            'Content-Type': 'application/json'
        }
    });

    const answer = await res.text();
    return {'text': answer};
}

/**
 * Sample function for booking a timeslot
 * In Video AI section in the dashboard in the advanced section, fill in "bookTimeslot" in "Name of the function",
 * "Description" - "Book a timeslot availability with email and name" and parameters - timeslot,email,name
 */
async function bookTimeslot(arg)
{
    // return {'text': 'Available timeslots for tomorrow'};
    const postData = JSON.stringify({
        arguments: arg,
        type: 'booktimeslot'
    });
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    const SERVER_URL = arg.url + 'server/script.php';

    const res = await fetch(SERVER_URL, {
        method: 'POST',
        body: postData,
        headers: {
            'Content-Type': 'application/json'
        }
    });

    const answer = await res.text();
    return {'text': answer};
}

/**
 * Exported functon. It is called from livesmart server, when there are tools (advanced options) set in the Dashboard. It requires function name, description and parameters as described in the above sample methods.
 * @param {*} functionName
 * @param {*} params
 * @returns {string}
 */

async function callFunction(functionName, params) {
    return await eval(functionName + '(' + params + ');');
};

exports.callFunction = callFunction;
