const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema({
  timePosted: Date,
  daysAgo: Number,
  title: String,
  address: String,
  price: String,
  specs: String,
  url: String
});

const Listing = mongoose.model("Listing", listingSchema);

module.exports = Listing;
