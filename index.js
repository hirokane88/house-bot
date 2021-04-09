const puppeteer = require("puppeteer");
const cheerio = require("cheerio");

scrapingResults = {
  timePosted: "xxx",
  title: "xxx",
  address: "xxx",
  price: "xxx",
  specs: "bed, bath, sqft, avaliable",
  url: "xxx"
}


async function scrapeListings(page) {
  await page.goto("https://sfbay.craigslist.org/search/scz/apa?postal=95060&max_price=6000&min_bedrooms=3&availabilityMode=0&sale_date=all+dates");
  const html = await page.content();
  const $ = cheerio.load(html);

  const listings = $(".result-info").map((index, element) => {
    const timeElement = $(element).find(".result-date");
    const titleElement = $(element).find(".result-title");
    const resultPriceElement = $(element).find(".result-meta").find(".result-price");
    const timePosted = new Date($(timeElement).attr("datetime"));
    const title = $(titleElement).text().toLowerCase();
    const price = $(resultPriceElement).text();
    const url = $(titleElement).attr("href");
    title.trim();
    price.trim();
    const address = "null";
    const specs = "null"
    return {timePosted, title, address, price, specs, url};
    }).get();
  return listings;      //return an array of objects(house listings)
}



async function sleep(miliseconds) {
  return new Promise(resolve => setTimeout(resolve, miliseconds));
}


async function scrapeDescriptions(listings, page) {
  for (var i = 0; i < listings.length; i++) { //loop through every single listing
    console.log(listings.length-i);
    await page.goto(listings[i].url);         //access the "url" that we scraped in scrapedListings
    const html = await page.content();
    const $ = cheerio.load(html);

    listings[i].address = $("div.mapaddress").text();
    listings[i].specs = $(".shared-line-bubble").map((index, element) => { //loop through bed/bath, sqft, etc.
      return $(element).text().toLowerCase(); //return the object to the array created by map()
      }).get();


    const random = (Math.random() + 1) * 1000;
    await sleep(random); //1 - 1.99... seconds
  }
}



async function main() {
  const browser = await puppeteer.launch({
    headless: false
  });
  const page = await browser.newPage();
  const listings = await scrapeListings(page); //Calls listings functions

  const listingsWithDespcriptions = await scrapeDescriptions(listings, page);
  console.log(listings);
}

main();
