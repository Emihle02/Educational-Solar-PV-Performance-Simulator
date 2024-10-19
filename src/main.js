let map;
let marker;
let powerChart;
let azimuth;
let scene, camera, renderer, circle, panel, tiltIndicator, azimuthIndicator;
let monthlyPowerChart;
let shadingFactor = 1; // No shading by default

// Constants for calculations
const LONGI_PANEL_COST = 5227; // R per Longi Solar panel
const LONGI_PANEL_CAPACITY = 0.45; // kW (450W per Longi Solar panel)
const PEAK_SUN_HOURS = 5.35; // Average peak sun hours per day


// Tariffs for domestic customers
const TARIFF_0_600 = 3.91; // R per kWh for 0-600 kWh
const TARIFF_600_PLUS = 4.75; // R per kWh for 600+ kWh


const MONTHLY_CONSUMPTION_SMALL = 100; // kWh
const MONTHLY_CONSUMPTION_MEDIUM = 800; // kWh
const MONTHLY_CONSUMPTION_LARGE = 2000; // kWh

const DAILY_CONSUMPTION_SMALL = 100 / 30; // kWh/day for small house
const DAILY_CONSUMPTION_MEDIUM = 800 / 30; // kWh/day for medium house
const DAILY_CONSUMPTION_LARGE = 2000 / 30; // kWh/day for large house

//set tilt angle to the latitude
//according to practice.
function calculateOptimalTiltAngle(latitude) {
    const latRad = Math.abs(latitude * Math.PI / 180);

    // Constants
    const SC = 1367; // Solar constant in W/m^2
    const rho = 0.2; // Ground reflectance (albedo)
    const n = 365; // Number of days in a year

    let maxGTI = 0;
    let optimalTilt = 0;

    // Iterate through possible tilt angles
    for (let tilt = 0; tilt <= 90; tilt++) {
        const tiltRad = tilt * Math.PI / 180;
        let annualGTI = 0;

        // Calculate GTI for each day of the year
        for (let day = 1; day <= n; day++) {
            // Solar declination angle (delta)
            const delta = 23.45 * Math.sin(2 * Math.PI * (284 + day) / 365) * Math.PI / 180;

            // Sunrise hour angle for horizontal surface (HSR)
            const HSR = Math.acos(-Math.tan(latRad) * Math.tan(delta));

            // Sunrise hour angle for collector face (HSRC)
            const HSRC = Math.min(
                Math.acos(-Math.tan(latRad) * Math.tan(delta)),
                Math.acos(-Math.tan(latRad - tiltRad) * Math.tan(delta))
            );

            // Daily extraterrestrial radiation using updated equation
            const H0 = (24 / Math.PI) * SC * (1 + 0.034 * Math.cos(2 * Math.PI * day / 365)) *
                (Math.cos(latRad) * Math.cos(delta) * Math.sin(HSR) + HSR * Math.sin(latRad) * Math.sin(delta));

            // Daily global horizontal irradiation (simplified clear-sky model)
            const beta = 0.1; // Atmospheric extinction coefficient
            const H = H0 * Math.exp(-beta / Math.sin(HSR));

            // Daily diffuse radiation (simplified)
            const Hd = 0.3 * H;

            // Calculate tilted irradiation components using RB from the provided equation
            const numerator = Math.cos(latRad - tiltRad) * Math.cos(delta) * Math.sin(HSRC) +
                HSRC * Math.sin(latRad - tiltRad) * Math.sin(delta);
            const denominator = Math.cos(latRad) * Math.cos(delta) * Math.sin(HSR) +
                HSR * Math.sin(latRad) * Math.sin(delta);
            const Rb = numerator / denominator;

            const GTI = (H - Hd) * Rb + Hd * (1 + Math.cos(tiltRad)) / 2 +
                rho * H * (1 - Math.cos(tiltRad)) / 2;

            annualGTI += GTI;
        }

        if (annualGTI > maxGTI) {
            maxGTI = annualGTI;
            optimalTilt = tilt;
        }
    }

    return Math.round(optimalTilt * 100) / 100; // Round to 2 decimal places
}



//the surface azimuth is set 180 in the southern hemisphere and 0 degrees in the northern hemisphere
// in the control, it supposed to be set to this first and then when user changes at controls it will change
function updateAzimuth(latitude) {

    if (latitude >= 0) { // Northern Hemisphere
    azimuth = 180;
    } else { // Southern Hemisphere
    azimuth = 0; //  or 360
    }

    return azimuth;

}


/**
 * Gets the hourly solar data that is needed to calculate the peak power of a given location
 * @param {*} lat the latitude of the location
 * @param {*} lng the longitude of the location
 * @returns solar_data
 */
async function getHourlySolarData(lat, lng) {

    const start = getStartAndEndDate()[0];
    const end = getStartAndEndDate()[1];
    const nasa_url = getApiUrl(start,end,lat,lng,"hourly")

    try {
        const solar_data = retrieveSolarData(nasa_url,lat,lng)
        return solar_data

    } catch (error) {
        console.error('Error fetching solar data:', error);
        return null;
    }
}


/**
 * returns a unique api for us to use for our get request
 * @param {String} startDate the start period of the data to request
 * @param {String} endDate the end period of the data to request
 * @param {*} lat the latitude of the location we want to get data of
 * @param {*} lng the longitude of the location we want to get data of
 * @param {String} period the type of data we want daily/hourly
 * @returns api url
 */
function getApiUrl(startDate, endDate, lat, lng, period){

    const main_url = `https://power.larc.nasa.gov/api/temporal/${period}/point?`
    const duration = `start=${startDate}&end=${endDate}`
    const coord = `&latitude=${lat}&longitude=${lng}`
    const parameters = `&community=re&parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DIFF,ALLSKY_SFC_SW_DNI&format=json&time-standard=lst`
    const nasa_url = main_url + duration + coord + parameters;
    return nasa_url
}

function getStartAndEndDate(){
    //the start date and end date will be yesterday until today but in 2023
    const today = new Date();
    const yesterday = new Date(today);

    yesterday.setDate(today.getDate() - 1);

    // Set both dates to the year 2023
    today.setFullYear(2023);
    yesterday.setFullYear(2023);

    // Format the dates as YYYYMMDD
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = ('0' + (date.getMonth() + 1)).slice(-2); // Months are 0-based in JS
        const day = ('0' + date.getDate()).slice(-2);
        return `${year}${month}${day}`;
    };

    const startDate = formatDate(yesterday);
    const endDate = formatDate(today);
    return [startDate,endDate]
}


/**
 * Retrieves the solar data response form the api and only takes what we need
 * @param {*} api_data the response from the api
 * @returns {*} Array [Elevation angle, {diff angle, dni, ghi}]
 */
function retrieve_vips(api_data){
    const vips = []
    // index 2 in coordinates referes to elavtion
    try{
        const elevation = parseInt(api_data.geometry.coordinates[2])
        // converting the api data into strings
        const data = JSON.stringify(api_data.properties.parameter);
        vips.push(elevation);
        vips.push(data);
    } catch (error){
        console.log("Something is wrong");
    }

    return vips;
}


/**
 * Cleans up the solar data and returns a new array with the ghi, dni, solar zenith and solar azimuth
 * @param {*} solar_data vips
 * @returns a new array with clean data
 */
function clean_solar_data_and_add_zenith(solar_data,latitude, longitude) {

    const clean_solar_data = {};

    const elevation_angle= solar_data[0]
    const parameters = solar_data[1]
    const dates = get_dates(parameters); // the dates that will be used as the keys for our solar data

    try {

        const zenith_angle = 90 - elevation_angle; // Zenith angle is 90 - elevation angle

        // parameters is a json object
        dates.forEach(date =>{
            const vip_data = retrieve_data(date,parameters) // getting the ghi,dni, dhi
            const date_time = get_correct_dateTime_format(date) // getting the date formate
            const azimuth = getAzimuth(date_time,latitude, longitude)
            const generated_data = generate_solar_data(vip_data,zenith_angle,azimuth)

            // appending the data to a new dictionary of date:data => date is the key
            clean_solar_data[date] = generated_data; // Example: { "2022092400" : data }
        })

        return clean_solar_data;
    } catch (error) {
        console.error('Something went wrong: ', error);
    }
}

/**
 * Creates a json string of the required solar data of a particular date.
 * @param {Array} vip_data An array containing the ghi, dni, dhi values
 * @param {*} zenith_angle the solar zenith angle
 * @param {*} azimuth_angle the solar azimuth angle
 * @returns A json formatted string with key:value pairs
 */
function generate_solar_data(vip_data, zenith_angle, azimuth_angle){
    const ghi = vip_data[0]
    const dni = vip_data[1]
    const dhi = vip_data[2]

    // our object that will be converted to json
    const object = {
        ghi : ghi,
        dni: dni,
        dhi: dhi,
        zen: zenith_angle,
        azm: azimuth_angle
    }

    return JSON.stringify(object)
}

/**
 * Getting the azimuth angle of the sun from a given data
 * @param {Date} data
 * @returns azimuth angle
 */
function getAzimuth(date, latitude, longitude){
    // Use SunCalc to get the azimuth angle
    // trying to use SunCalc to get the azimuth cause the new API doesn't give an azimuth angle
    const sunPosition = SunCalc.getPosition(date, latitude, longitude);
    const azimuth = sunPosition.azimuth * (180 / Math.PI); // Convert from radians to degrees

    
    return azimuth.toFixed(2)
}


/**
 * Returns a date object that will then be used to get the suns position using sunCalc
 * @param {Date} date
 * @returns date Object
 */
function get_correct_dateTime_format(date){

    try{
        const year = date.slice(0,4)
        const month = date.slice(4,6) -1 // computer correction since pc's start counting from 0
        const day = date.slice(6,8)
        const hours = date.slice(8,10)

        return new Date(year,month,day,hours);
    }catch(error){
        throw new Error("The date is incorrect")
    }


}

/**
 * Gets all the dates in the api data
 * @param {String} api_data
 */
function get_dates(api_data){
    // converting the json string to json object, then retrieving the key
    const data = JSON.parse(api_data)["ALLSKY_SFC_SW_DIFF"];
    try{
        return Object.keys(data)
    }catch (error){
        // console.log("Error by get_dates")
        throw new Error("Error trying to get the dates")
    }
}

/**
 * Returns an array of the ghi, dni, dhi of a given hour of the day
 * @param {String} key the date formatted as YYYY-MM-DD-HH (NO DASH)
 * @param {String} data the JSON string, note in the function we converting it to JSON Object
 * @returns Array of [ghi,dni,dhi]
 */
function retrieve_data(key , data){
    const map = JSON.parse(data)
    const clean_data = []

    const DHI = map["ALLSKY_SFC_SW_DIFF"][key];
    const DNI = map["ALLSKY_SFC_SW_DNI"][key];
    const GHI = map["ALLSKY_SFC_SW_DWN"][key];

    clean_data.push(GHI);
    clean_data.push(DNI);
    clean_data.push(DHI);
    return clean_data

}


function getHourAngle(time){
    const hours = time.split('T')[1]
    const st_time  = hours.split(":")[0]
    return (15 * (12-parseInt(st_time)))
}


function dayOfTheYear() {
    const date = new Date()
    const thirty_days = [4, 6, 9, 10]; // the months that end on thirty days
    const current_month = date.getMonth(); // the month we in
    const current_day = date.getDate(); // the day we are

    let day_of_year = 0;
    let date_control = 0;
    let month = 0; // getMonth() returns a number 0 to 11
    let data = []

    while (day_of_year < 366) {
        if (thirty_days.includes(month)) {
            data = day_controller(day_of_year, date_control, month, 30); // April, June, September, November
            day_of_year = data[0]
            date_control = data[1]
            month = data[2]
        } else if (month == 1) { // since getMonth returns 0 to 11, that means feb is month 1
            data = day_controller(day_of_year, date_control,month, 28); // feb
            day_of_year = data[0]
            date_control = data[1]
            month = data[2]
        } else {
            data = day_controller(day_of_year, date_control, month, 31); // the other months that do not matter
            day_of_year = data[0]
            date_control = data[1]
            month = data[2]
        }

        if (date_control == current_day && month == current_month) {
            return day_of_year;
        } else if (day_of_year == 365) {
            return dayOfTheYear;
        }
    }
}


function day_controller(day_of_year, date_control, month,reset_day) {
    let new_day =  day_of_year + 1;
    let new_controller = date_control + 1;
    let new_month = month
    // reset date is the last date of the month
    if (new_controller > reset_day) {
        new_controller = 1;
        new_month = month + 1;
    }

    return [new_day, new_controller, new_month]
}


function solar_declination(){
    const day = dayOfTheYear()
    const degrees_to_radians = Math.PI / 180; // converting degree to radians to get the angle

    //Solar Declination: Varies throughout the year as the Earth orbits around the Sun.
    // The equation below gives us approximated value of the solar declination:
    return 23.45 * Math.sin( (360/365)  * (284 + day) * degrees_to_radians) // the value returned is closes to ESR
}


function calculateAngleOfIncidence(tilt, surfaceAzimuth, solarZenith, solarAzimuth) {
    const tiltRad = tilt * Math.PI / 180;
    const surfaceAzimuthRad = surfaceAzimuth * Math.PI / 180;
    const solarZenithRad = solarZenith * Math.PI / 180;
    const solarAzimuthRad = solarAzimuth * Math.PI / 180;

    return Math.acos(
        Math.cos(solarZenithRad) * Math.cos(tiltRad) +
        Math.sin(solarZenithRad) * Math.sin(tiltRad) * Math.cos(solarAzimuthRad - surfaceAzimuthRad)
    );
}

/**
 * Calculates the Peak power generated by a solar panel if set up in a particular condition
 * @param {*} solarData the data required to calculate the peak power (ghi, dhi, dni, zenith, elevation)
 * @param {*} tilt the tilt angle of the solar panel
 * @param {*} azimuth surface azimuth angle. The direction in which the solar panel is facing
 * @param {*} lat the latitude of the location
 * @param {*} lng the longitude of the location
 * @returns max power generated and an array of the hourly power
 */
function calculatheourlyPeakPower(solarData, tilt, azimuth, lat, lng) {

    let maxPower = 0;
    const hourlyPower = new Array(24).fill(0);

    for (const timestamp in solarData) {
        const data = JSON.parse(solarData[timestamp]);

        const GHI = data.ghi;
        const DHI = data.dhi;
        const DNI = data.dni;
        const SZA = data.zen;
        const SAA = data.azm;

        // Calculate angle of incidence (θ)
        const theta = calculateAngleOfIncidence(tilt, azimuth, SZA, SAA);
        const power = calculatePower(theta, GHI, DHI, DNI, tilt) * shadingFactor; //when the shading factor is 1 then shading has no effect
        // Update the hourly and maximum power values
        const hour = get_correct_dateTime_format(timestamp).getHours();
        hourlyPower[hour] = Math.max(hourlyPower[hour], power.toFixed(2));

        if (power > maxPower) {
            maxPower = power;
        }
    }
    return { maxPower, hourlyPower };
}


function calculatePower(theta,GHI,DHI,DNI,tilt){
    const panelArea = 4; // Updated area for a 1kW solar panel in m^2
    const panelEfficiency = 0.20; // Typical efficiency of a solar panel (20%)

    // Calculate beam irradiance on tilted surface (Gb)
    const Gb = DNI * Math.cos(theta * Math.PI / 180);

    // Calculate diffuse irradiance on tilted surface (Gd)
    const Gd = DHI * (1 + Math.cos(tilt * Math.PI / 180)) / 2;

    // Calculate ground-reflected irradiance (Gr)
    const rho = 0.2; // Typical ground reflectance
    const Gr = rho * GHI * (1 - Math.cos(tilt * Math.PI / 180)) / 2;

    // Calculate Global Tilted Irradiance (GT)
    const GT = Gb + Gd + Gr;

    // Calculate Power (Power = Irradiance * Area * Efficiency)
    const power = GT * panelArea * panelEfficiency;

    return power
}

/**
 * Gets the daily solar data needed to calculate the peak annual power
 * @param {*} lat the latitude of the location
 * @param {*} lng the longitude of the location
 * @returns
 */
async function getDailySolarData(lat, lng) {

    const nasa_url = getApiUrl("20230101","20231231",lat,lng,"daily")

    try {
        const solar_data = retrieveSolarData(nasa_url,lat,lng)
        return solar_data

    } catch (error) {
        console.error('Error fetching solar data:', error);
        return null;
    }
}


/**
 * Given an api, this function retrieves the necessary data.
 * Cleans the data and returns what is needed
 * @param {*} nasa_url the api endpoint
 * @param {*} lat the latitude of the location
 * @param {*} lng the longitude of the location
 * @returns clean data
 */
async function retrieveSolarData(nasa_url,lat,lng){

    try{
        const response = await fetch(nasa_url);
        const api_data = await response.json();
        console.log('Raw API Response:', api_data);

        const data = retrieve_vips(api_data)
        console.log(`the vips: ${data}`)
        const solar_data = clean_solar_data_and_add_zenith(data, lat, lng)
        return solar_data
    } catch (error) {
        console.error('Error fetching solar data:', error);
        return null;
    }
}


function generate_solar_data(vip_daily_data, zenith_angle, azimuth_angle){
    const ghi = vip_daily_data[0]
    const dni = vip_daily_data[1]
    const dhi = vip_daily_data[2]

    // our object that will be converted to json
    const object = {
        ghi : ghi,
        dni: dni,
        dhi: dhi,
        zen: zenith_angle,
        azm: azimuth_angle
    }

    return JSON.stringify(object)
}

function calculateMonthlyAverages(solarData, tilt, azimuth, lat) {
    const monthlyPower = Array(12).fill(0);
    const monthlyDays = Array(12).fill(0);

    for (const timestamp in solarData) {
        const data = JSON.parse(solarData[timestamp]);
        const date = get_correct_dateTime_format(timestamp);
        const month = date.getMonth();

        const GHI = data.ghi;
        const DHI = data.dhi;
        const DNI = data.dni;

        const solarDeclination = solar_declination(date.getDate());
        const hourAngle = 0; // Use noon as reference point for daily calculation
        const theta = calculateAngleOfIncidence(tilt, azimuth, solarDeclination, hourAngle, lat);

        const dailyPower = calculatePower(theta, GHI, DHI, DNI, tilt) * 24; // Daily energy in Wh
        
        monthlyPower[month] += dailyPower / 1000; // Convert to kWh
        monthlyDays[month]++;
    }

    const monthlyAveragePower = monthlyPower.map((power, index) => ({
        month: index,
        power: power / monthlyDays[index] // Average daily power for the month
    }));

    return monthlyAveragePower;
}

/**
 * Returns the number of days in a given month
 * @param {number} month the number of the month in the year example Jan = 1
 * @returns 28 | 30 | 31
 */
function numberOfDaysInMonth(month){
    const thirty_days = [4, 6, 9, 10]; // the months that end on thirty days

    // feb
    if (month == 1){
        return 28
    }

    if (thirty_days.includes(month)){
        return 30
    }

    return 31
}


function createSunPathDiagram(lat, lng) {
    const isNorthernHemisphere = lat >= 0;
    const canvas = document.getElementById('sunPathDiagram');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= width; i += width / 18) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, height);
        ctx.stroke();
    }
    for (let i = 0; i <= height; i += height / 9) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(width, i);
        ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width, height);
    ctx.stroke();

    // Label axes
    ctx.fillStyle = 'black';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    for (let az = 0; az <= 360; az += 20) {
        const x = (az / 360) * width;
        ctx.fillText(az + '°', x, height - 5);
    }
    for (let el = 0; el <= 90; el += 10) {
        const y = height - (el / 90) * height;
        ctx.fillText(el + '°', 20, y);
    }
    ctx.fillText('E', width * 0.25, height - 20);
    ctx.fillText('S', width * 0.5, height - 20);
    ctx.fillText('W', width * 0.75, height - 20);
    ctx.fillText('N', width - 20, height - 20);

    // Calculate sun positions for different days of the year
    const year = new Date().getFullYear();

    let days;
    let legends;

    if (isNorthernHemisphere) {
        days = [
            new Date(year, 11, 21), // Winter solstice (blue)
            new Date(year, 2, 20),  // Spring equinox (green)
            new Date(year, 5, 21),  // Summer solstice (red)
        ];
        legends = ['Winter solstice', 'Spring/Autumn equinox', 'Summer solstice'];
    } else {
        days = [
            new Date(year, 5, 21),  // Winter solstice (blue)
            new Date(year, 2, 20),  // Spring equinox (green)
            new Date(year, 11, 21), // Summer solstice (red)
        ];
        legends = ['Winter solstice', 'Spring/Autumn equinox', 'Summer solstice'];
    }

    const colors = ['blue', 'green', 'red'];

    days.forEach((day, index) => {
        const sunPositions = [];
        for (let hour = 0; hour < 24; hour++) {
            const date = new Date(day.getTime());
            date.setHours(hour, 0, 0);
            const sunPosition = SunCalc.getPosition(date, lat, lng);
            if (sunPosition.altitude > 0) {
                sunPositions.push({
                    azimuth: (sunPosition.azimuth * 180 / Math.PI + 180) % 360,
                    altitude: sunPosition.altitude * 180 / Math.PI,
                    hour: hour
                });
            }
        }

        // Plot sun path
        ctx.strokeStyle = colors[index];
        ctx.lineWidth = 2;
        ctx.beginPath();
        sunPositions.forEach((pos, i) => {
            const x = (pos.azimuth / 360) * width;
            const y = height - (pos.altitude / 90) * height;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }

        // Add hour markers
        // Add hour markers
        if (pos.hour % 1 === 0) {
            ctx.fillStyle = colors[index];
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
            ctx.fillText(pos.hour, x, y - 10);
        }
        });
        ctx.stroke();
    });

    // Add legend
    legends.forEach((text, i) => {
        ctx.fillStyle = colors[i];
        ctx.fillText(text, width - 100, 20 + i * 20);
        });
}


function initMap() {
    // johnny changed it : from -33.959168 to -33.1111111
// Bangkok, Thailand (13.7563, 100.5018)d
//Alice Springs, Australia(-23.6980, 133.8807)d
//(30.0333, 31.2333)d
//Paris, France (48.8566, 2.3522)d
//Miami/Richmond, USA (25.6153, -80.4410)d
//Ulaanbaatar/Ulan Bator, Mongolia(47.9167, 106.9172)d
//Thessaloniki/Livadákion, Greece(40.6401, 22.9444)d
//Mexico City, Mexico(19.4326, -99.1332)d
//Helsinki/Alppikylä, Finland(60.1695, 24.9354)d
//Sydney Harbour/ Georges Heights, Australia(-33.8395, 151.2573)

    map = L.map('map').setView([19.4326, -99.1332], 9);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
    }).addTo(map);

    map.on('click', onMapClick);

    // Initial marker
    marker = L.marker([19.4326, -99.1332]).addTo(map);
    updateLocation(19.4326, -99.1332);
}


async function updateLocation(lat, lng) {

    document.getElementById('location').value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    marker.setLatLng([lat, lng]);
    const optimalAngle = calculateOptimalTiltAngle(lat);
    document.getElementById('optimumAngle').innerText = optimalAngle.toFixed(2);
    document.getElementById('tilt').value = optimalAngle;
    document.getElementById('tiltValue').innerText = optimalAngle.toFixed(2);

    try {

        const solarData = await getHourlySolarData(lat, lng);
        const dailyData = await getDailySolarData(lat, lng);


        if (solarData && Object.keys(solarData).length > 0) {
            const tilt = parseFloat(document.getElementById('tilt').value);
            const azimuth = updateAzimuth(lat);
            const { maxPower, hourlyPower } = calculatheourlyPeakPower(solarData, tilt, azimuth, lat, lng);
            const monthlyAveragePower = calculateMonthlyAverages(dailyData, tilt, azimuth, lat);

            if (isNaN(maxPower)) {
                document.getElementById('peakPower').innerText = 'Error: Invalid calculation';
            } else {
                document.getElementById('peakPower').innerText = maxPower.toFixed(2);
            }
            updatePowerChart(hourlyPower);
            updateMonthlyPowerChart(monthlyAveragePower);

        } else {
            console.error('No solar data available or empty data set');
            document.getElementById('peakPower').innerText = 'N/A: No data available';
        }

        map.setView([lat, lng], map.getZoom());
    } catch (error) {
        console.error('Error updating location:', error);
        document.getElementById('peakPower').innerText = 'Error: ' + error.message;
    }

    const tilt = document.getElementById('tilt').value;
    const azimuth = document.getElementById('azimuth').value;
    initSolarDiagram();
    updateSolarDiagram(tilt, azimuth);
    createSunPathDiagram(lat, lng);
}

// update location v2
async function updatePeakPowerByControl(lat, lng, azimuth, tilt) {
    console.log("We CLICKED somethings")
    document.getElementById('location').value = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    marker.setLatLng([lat, lng]); // Ensure marker is at the correct position

    try {

        const solarData = await getHourlySolarData(lat, lng);
        const dailyData = await getDailySolarData(lat, lng);
        console.log('Fetched Solar Data:', solarData);
        console.log('Solar Data length:', solarData.length);

        if (solarData && dailyData) {
            console.log("Trying our luck, at this point (oh azimuth): ",azimuth)

            const { maxPower, hourlyPower } = calculatheourlyPeakPower(solarData, tilt, azimuth, lat, lng);

            
            if (isNaN(maxPower)) {
                document.getElementById('peakPower').innerText = 'Error: Invalid calculation';
            } else {
                document.getElementById('peakPower').innerText = maxPower.toFixed(2);
            }
            updatePowerChart(hourlyPower);
            const monthlyAveragePower = calculateMonthlyAverages(dailyData, tilt, azimuth, lat);
            updateMonthlyPowerChart(monthlyAveragePower);

        } else {
            console.error('No solar data available or empty data set');
            document.getElementById('peakPower').innerText = 'N/A: No data available';
        }

        map.setView([lat, lng], map.getZoom());
    } catch (error) {
        console.error('Error updating location:', error);
        document.getElementById('peakPower').innerText = 'Error: ' + error.message;
    }

    initSolarDiagram(); // Add this line
    updateSolarDiagram(tilt, azimuth);
    createSunPathDiagram(lat, lng);
}


function updateControls() {
    const azimuth = parseFloat(document.getElementById('azimuth').value);
    const tilt = parseFloat(document.getElementById('tilt').value);
    console.log("The tilt: ", tilt)
    console.log("The azimuth: ",azimuth)

    updateSolarDiagram(tilt, azimuth);
    const soiling = document.getElementById('soiling').value;
    const zoom = document.getElementById('zoom').value;
    console.log("The soil", soiling)
    console.log("The zoom", zoom)

    const shading = parseFloat(document.getElementById('shading').value);
    shadingFactor = 1 - (shading / 100);
    document.getElementById('shadingValue').textContent = shading + '%';

    document.getElementById('azimuthValue').textContent = azimuth;
    document.getElementById('tiltValue').textContent = tilt;
    document.getElementById('soilingValue').textContent = soiling;
    document.getElementById('zoomValue').textContent = zoom;

    map.setZoom(zoom);

    // Recalculate peak power with new tilt and azimuth
    const lat = parseFloat(document.getElementById('location').value.split(',')[0]);
    const lng = parseFloat(document.getElementById('location').value.split(',')[1]);

    console.log("Just before the storm")
    updatePeakPowerByControl(lat, lng,azimuth, tilt);
    updateSolarDiagram(tilt, azimuth);
}


function initSolarDiagram() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // Use perspective camera
    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    camera.position.set(2, 2, 3); // Adjust the camera position to zoom out
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(400, 400); // Increase the size of the renderer
    renderer.setPixelRatio(window.devicePixelRatio); // Ensure it looks good on all screens

    const diagramContainer = document.getElementById('solar-diagram');
    document.getElementById('solar-diagram').innerHTML = '';
    document.getElementById('solar-diagram').appendChild(renderer.domElement);

    // Set the size and styling of the diagram container
    diagramContainer.style.width = '100%';
    diagramContainer.style.height = '100%';
    diagramContainer.style.overflow = 'hidden'; // Ensure it doesn't overflow the card

    // Create ellipse (base)
    const ellipseGeometry = new THREE.RingGeometry(1.8, 2, 64);
    const ellipseMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    circle = new THREE.Mesh(ellipseGeometry, ellipseMaterial);
    circle.rotation.x = -Math.PI / 2; // Lay flat
    scene.add(circle);

    // Create panel with thickness
    const panelGeometry = new THREE.BoxGeometry(1, 0.6, 0.05);
    const panelMaterial = new THREE.MeshPhongMaterial({
        color: 0x1e90ff,
        shininess: 100
    });
    panel = new THREE.Mesh(panelGeometry, panelMaterial);
    panel.rotation.x = Math.PI / 2; // Start vertical
    scene.add(panel);

    // Add grid texture to panel
    addGridToPanel(panel);

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Create cardinal direction labels
    const cardinalDirections = ['N', 'E', 'S', 'W'];
    cardinalDirections.forEach((direction, index) => {
        const cardinalLabel = createLabel(direction, 0.7);
        const angle = (index * Math.PI / 2) - Math.PI / 4;
        cardinalLabel.position.set(
            2.5 * Math.cos(angle),
            0.1,
            2.5 * Math.sin(angle)
        );
        scene.add(cardinalLabel);
    });

    // Create tilt and azimuth indicators
    tiltIndicator = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    panel.position,
    1,
    0xffff00);

    scene.add(tiltIndicator);

    azimuthIndicator = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        panel.position,
        1,
        0xff00ff);

    azimuthIndicator.rotation.x = -Math.PI / 2;
    scene.add(azimuthIndicator);
    renderer.render(scene, camera);
}


function addGridToPanel(panel) {
    const gridTexture = new THREE.TextureLoader().load('path_to_grid_texture.png');
    gridTexture.wrapS = THREE.RepeatWrapping;
    gridTexture.wrapT = THREE.RepeatWrapping;
    gridTexture.repeat.set(5, 3);
    panel.material.map = gridTexture;
    panel.material.needsUpdate = true;
}


function createProtractorIndicator(radius, color) {
    const geometry = new THREE.CircleGeometry(radius, 32, 0, Math.PI);
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const protractor = new THREE.Mesh(geometry, material);

    const arrow = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 0),
        radius * 1.2,
        color
    );
    protractor.add(arrow);

    return protractor;
}


function createLabel(text, scale) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = '70px Arial'; // Increase font size
    context.fillStyle = 'white';
    context.fillText(text, 0, 70);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(scale, scale, 1);
    return sprite;
}


function updateSolarDiagram(tilt, azimuth) {
    if (!scene || !camera || !renderer || !panel || !tiltIndicator || !azimuthIndicator) {
        console.error('Solar diagram not initialized');
        return;
    }

    // Convert degrees to radians
    const tiltRad = THREE.MathUtils.degToRad(tilt);
    const azimuthRad = THREE.MathUtils.degToRad(azimuth);

    // Update panel rotation
    panel.rotation.set(0, 0, 0); // Reset rotation
    panel.rotateY(-azimuthRad); // Adjust azimuth (negative to rotate clockwise)
    panel.rotateX(Math.PI/2 - tiltRad); // Adjust tilt (start from vertical position)

    // Update tilt indicator (arrow)
    tiltIndicator.position.copy(panel.position);
    tiltIndicator.rotation.set(0, -azimuthRad, Math.PI/2 - tiltRad);

    // Update azimuth indicator (arrow)
    azimuthIndicator.position.copy(panel.position);
    azimuthIndicator.rotation.set(-Math.PI/2, 0, -azimuthRad);

    renderer.render(scene, camera);
}

function updateLabel(name, text, position) {
    let label = scene.getObjectByName(name);
    if (label) scene.remove(label);

    label = createLabel(text, 0.6); // Increase scale
    label.position.copy(position);
    label.name = name;
    scene.add(label);
}


function updatePowerChart(hourlyPower) {
    const ctx = document.getElementById('powerChart').getContext('2d');
    const soilingRatio = parseFloat(document.getElementById('soiling').value);

    // Ensure hourlyPower is an array with 24 elements
    const powerWithoutSoiling = Array.isArray(hourlyPower) && hourlyPower.length === 24
        ? hourlyPower
        : Array(24).fill(0);

    const powerWithSoiling = powerWithoutSoiling.map(value => value * (1 - soilingRatio));
    const powerWithShading = powerWithoutSoiling.map(value => value * shadingFactor);

    if (powerChart) {
        powerChart.destroy();
    }

    powerChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0') + ':00'),
            datasets: [
                {
                    label: 'Power Without Soiling (W)',
                    data: powerWithoutSoiling,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1,
                    fill: false,
                },
                {
                    label: 'Power With Soiling (W)',
                    data: powerWithSoiling,
                    borderColor: 'rgb(255, 99, 132)',
                    tension: 0.1,
                    fill: false,
                },
                {
                    label: 'Power With Shading (W)',
                    data: powerWithShading,
                    borderColor: 'rgb(255, 165, 0)',
                    tension: 0.1,
                    fill: false,
                }
            ],
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Power (W)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.2)',
                    },
                },
                x: {
                    title: {
                        display: true,
                        text: 'Hour of the Day'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.2)',
                    },
                },
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                },
            },
        },
    });

    console.log('Hourly Power Data:', powerWithoutSoiling);
}


function updateMonthlyPowerChart(monthlyAveragePower) {
    const ctx = document.getElementById('monthlyPowerChart').getContext('2d');
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    if (monthlyPowerChart instanceof Chart) {
        monthlyPowerChart.destroy();
    }

    monthlyPowerChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: monthNames,
            datasets: [{
                label: 'Average Daily Power Output (kWh/day)',
                data: monthlyAveragePower.map(d => d.power.toFixed(2)),
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgb(75, 192, 192)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Average Daily Power (kWh/day)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.2)',
                    },
                },
                x: {
                    title: {
                        display: true,
                        text: 'Month'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.2)',
                    },
                },
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.parsed.y} kWh/day`;
                        }
                    }
                }
            }
        },
    });
}

// Estimate the number of Longi panels required
function calculatePanelCount(dailyConsumption) {
    // Calculate required PV power based on daily consumption and peak sun hours
    const requiredPVPower = dailyConsumption / PEAK_SUN_HOURS;

    // Calculate the number of panels required, rounding up to the nearest whole number
    return Math.ceil(requiredPVPower / LONGI_PANEL_CAPACITY);
}

// Estimate installation cost
function calculateInstallationCost(panelCount) {
    return panelCount * LONGI_PANEL_COST;
}

// Calculate bill reduction based on PV system size and Cape Town tariffs
// Estimate bill reduction based on PV system size and tariffs
function calculateBills(pvSize, monthlyConsumption) {
    const monthlyPVProduction = pvSize * PEAK_SUN_HOURS * 30; // PV production based on daily peak sun hours
    const daytimeConsumption = 0.22 * monthlyConsumption; // Assume 22% of consumption happens during the day
    const gridUsage = monthlyConsumption - Math.min(monthlyPVProduction, daytimeConsumption); // Any excess from PV during the day is sent back to the grid

    let reducedBill;
    if (gridUsage <= 600) {
        reducedBill = gridUsage * TARIFF_0_600;
    } else {
        const upTo600 = 600 * TARIFF_0_600;
        const above600 = (gridUsage - 600) * TARIFF_600_PLUS;
        reducedBill = upTo600 + above600;
    }

    const originalBill = monthlyConsumption <= 600 ?
        monthlyConsumption * TARIFF_0_600 :
        600 * TARIFF_0_600 + (monthlyConsumption - 600) * TARIFF_600_PLUS;

    return {
        originalBill: originalBill.toFixed(2), // Return original bill
        reducedBill: reducedBill.toFixed(2)    // Return reduced bill after solar
    };
}


function updateFinancialAspects() {
    const householdSize = document.getElementById('household-size').value;
    let monthlyConsumption;

    // Determine household size and monthly consumption
    if (householdSize === 'small') {
        monthlyConsumption = MONTHLY_CONSUMPTION_SMALL;
    } else if (householdSize === 'medium') {
        monthlyConsumption = MONTHLY_CONSUMPTION_MEDIUM;
    } else {
        monthlyConsumption = MONTHLY_CONSUMPTION_LARGE;
    }

    const dailyConsumption = monthlyConsumption / 30;
    const panelCount = calculatePanelCount(dailyConsumption);
    const pvSize = panelCount * LONGI_PANEL_CAPACITY;
    const installationCost = calculateInstallationCost(panelCount);

    document.getElementById('monthly-consumption').textContent = `${monthlyConsumption.toFixed(2)} kWh`;
    document.getElementById('pv-size').textContent = `${pvSize.toFixed(2)} kW`;
    document.getElementById('installation-cost').textContent = `R${installationCost.toFixed(2)}`;
    document.getElementById('panel-count').textContent = `${panelCount} Panels(450W)`;

    const bills = calculateBills(pvSize, monthlyConsumption);
    document.getElementById('original-bill').textContent = `R${bills.originalBill}`;
    document.getElementById('reduced-bill').textContent = `R${bills.reducedBill}`;
}

// Event listener to trigger the calculation when the user selects a household size
document.addEventListener('DOMContentLoaded', updateFinancialAspects);

document.getElementById('household-size').addEventListener('change', updateFinancialAspects);

        function onMapClick(e) {
            var lat = e.latlng.lat;
            var lng = e.latlng.lng;
            marker.setLatLng([lat, lng]); // Update the marker's position
            updateLocation(lat, lng);
        }

        window.onload = () => {
            initMap();
            updatePowerChart();
            initSolarDiagram(); // Add this line
            updateControls();
            updateMonthlyPowerChart([]);
            updateFinancialAspects();
        };