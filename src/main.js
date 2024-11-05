let map;
let marker;
let powerChart;
let azimuth;
let scene, camera, renderer, circle, panel, tiltIndicator, azimuthIndicator;
let monthlyPowerChart;
//let shadingFactor = 1; // No shading by default

// default soiling and shading values
document.getElementById("shading").value = 0;
document.getElementById("soiling").value = 0;

async function getHourlySolarDataforSizing(lat, lng, season) {
    const isNorthernHemisphere = lat > 0;
    
    // Define solstice dates based on hemisphere
    const solsticeDates = {
        northern: {
            summer: "0621", // June 21
            winter: "1221"  // December 21
        },
        southern: {
            summer: "1221", // December 21
            winter: "0621"  // June 21
        }
    };

    // Select the appropriate dates based on hemisphere
    const hemisphere = isNorthernHemisphere ? 'northern' : 'southern';
    const date = solsticeDates[hemisphere][season];
    
    // Use the year 2023 for consistency
    const year = "2023";
    const fullDate = `${year}${date}`;
    
    const nasa_url = getApiUrl(fullDate, fullDate, lat, lng, "hourly");
    
    try {
        const solar_data = await retrieveSolarData(nasa_url, lat, lng);
        return solar_data;
    } catch (error) {
        console.error(`Error fetching ${season} solar data:`, error);
        return null;
    }
}

function calculatePeakSunHours(solarData) {
    let dailyGHI = 0;
    const hourlyValues = [];

    // Sum up all GHI values for the day
    for (const timestamp in solarData) {
        const data = JSON.parse(solarData[timestamp]);
        dailyGHI += data.ghi;
        hourlyValues.push(data.ghi);
    }
    
    return dailyGHI / 1000;
}

async function calculateSystemRequirements(houseType, lat, lng) {
    // Constants
    const PANEL_RATING = 0.4; // 400W = 0.4kW
    const SYSTEM_EFFICIENCY = 0.80; // 75% efficiency
    const DAILY_CONSUMPTION = houseType === 'rural' ? 3.3 : 15; // kWh
    
    // Get solar data for both summer and winter
    const summerData = await getHourlySolarDataforSizing(lat, lng, 'summer');
    const winterData = await getHourlySolarDataforSizing(lat, lng, 'winter');
    
    if (!summerData || !winterData) {
        throw new Error('Unable to retrieve solar data');
    }

    // Calculate Peak Sun Hours for both seasons
    const summerPSH = calculatePeakSunHours(summerData);
    const winterPSH = calculatePeakSunHours(winterData);

    //more error handling.
    if (summerPSH <= 0.001 || winterPSH <= 0.001) {
        console.warn(`Very low sun hours detected for location (${lat}, ${lng}). 
          Summer PSH: ${summerPSH}, Winter PSH: ${winterPSH}`);
      }
    
    
    // Calculate annual energy needed
    const ANNUAL_ENERGY = DAILY_CONSUMPTION * 365; // kWh

    // Calculate system sizes for summer and winter
    const summerCalculations = calculateSystemSize(DAILY_CONSUMPTION, PANEL_RATING, summerPSH, SYSTEM_EFFICIENCY);
    const winterCalculations = calculateSystemSize(DAILY_CONSUMPTION, PANEL_RATING, winterPSH, SYSTEM_EFFICIENCY);

    return {
        dailyConsumption: DAILY_CONSUMPTION,
        annualConsumption: ANNUAL_ENERGY,
        summerSystem: summerCalculations,
        winterSystem: winterCalculations
    };
}

/**
 * Helper function to calculate system size and panel count
 * @param {number} dailyEnergy Daily energy consumption in kWh
 * @param {number} panelRating Panel rating in kW
 * @param {number} sunHours Average sun hours
 * @param {number} efficiency System efficiency
 * @returns {Object} System size and panel count
 */
function calculateSystemSize(dailyEnergy, panelRating, sunHours, efficiency) {
    if (sunHours <= 0.001) {  // Using a small threshold to account for floating-point imprecision
        return {
          systemSize: 0,
          panelCount: 0
        };
      }
    // Calculate required system size in kW
    const systemSize = dailyEnergy / (sunHours * efficiency);
    
    // Calculate number of panels needed
    const panelCount = Math.ceil(systemSize / panelRating);
    
    return {
        systemSize: systemSize,
        panelCount: panelCount
    };
}

/**
 * Updates the UI with the calculation results
 * @param {Object} results Calculation results from calculateSystemRequirements
 */
function updateCalculatorUI(results) {
    // Update daily consumption
    document.getElementById('daily-consumption').textContent = 
        `${results.dailyConsumption.toFixed(1)} kWh`;
    
    // Update annual consumption
    document.getElementById('annual-consumption').textContent = 
        `${results.annualConsumption.toFixed(1)} kWh`;
    
    // Update summer system details
    document.getElementById('pv-summer-size').textContent = 
        `${results.summerSystem.systemSize.toFixed(2)} kW`;
    document.getElementById('panel-count-summer').textContent = 
        results.summerSystem.panelCount;
    
    // Update winter system details
    document.getElementById('pv-winter-size').textContent = 
        `${results.winterSystem.systemSize.toFixed(2)} kW`;
    document.getElementById('panel-count-winter').textContent = 
        results.winterSystem.panelCount;
}

// Event listener for the calculate button
document.getElementById('calculate-button').addEventListener('click', async () => {
    const houseType = document.getElementById('house-type').value;
    const lat = parseFloat(document.getElementById('location').value.split(',')[0]);
    const lng = parseFloat(document.getElementById('location').value.split(',')[1]);
    
    try {
        const results = await calculateSystemRequirements(houseType, lat, lng);
        updateCalculatorUI(results);
    } catch (error) {
        console.error('Error calculating system requirements:', error);
    }
});

function calculateShadingFactor(shading) {
    if (shading <= 20) {
        // Light shading: Reduce power by 10% to 20%
        return 1 - (shading / 200); // 10% to 20% reduction
    } else if (shading <= 50) {
        // Moderate shading: Reduce power by 30% to 50%
        return 1 - (0.3 + (shading - 20) / 100); // 30% to 50% reduction
    } else {
        // Heavy shading: Reduce power by 60% to 80%
        return 1 - (0.6 + (shading - 50) / 100); // 60% to 80% reduction
    }
}

// Constants for calculations

//tooltips, the hovering 
const tooltips = document.querySelectorAll('.tooltip');

tooltips.forEach(tooltip => {
    tooltip.addEventListener('mouseenter', () => {
        // Show tooltip (already handled by CSS)
    });

    tooltip.addEventListener('mouseleave', () => {
        // Hide tooltip (already handled by CSS)
    });
});

function calculateShadingEffect(shading) {
    // Exponential shading model for more realistic power reduction
    return Math.pow(1 - (shading / 100), 2);

}

function calculatePowerWithShading(hourlyPower, shading) {
    const shadingFactor = calculateShadingEffect(shading);
    return hourlyPower.map(value => value * shadingFactor);
}


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

//seasonal change selection


/**
 * Gets the hourly solar data that is needed to calculate the peak power of a given location
 * @param {*} lat the latitude of the location
 * @param {*} lng the longitude of the location
 * @returns solar_data
 */
async function getHourlySolarData(lat, lng) {
    const isNorthernHemisphere = lat > 0;

    // Define solstice dates based on hemisphere
    const solsticeDates = {
        northern: "0621", // June 21
        southern: "1221"  // December 21
    };

    // Select the summer solstice date based on hemisphere
    const hemisphere = isNorthernHemisphere ? 'northern' : 'southern';
    const date = solsticeDates[hemisphere];
    
    // Use a consistent year (e.g., 2023)
    const year = "2023";
    const fullDate = `${year}${date}`;
    
    const nasa_url = getApiUrl(fullDate, fullDate, lat, lng, "hourly");

    try {
        const solar_data = await retrieveSolarData(nasa_url, lat, lng);
        console.log(solar_data);
        return solar_data;
    } catch (error) {
        console.error('Error fetching solar data:', error);
        return null;
    }
}


async function getDecemberHourlyAvgPower(lat, lng){
    getApiUrl("20231201","20231231",lat,lng,"Hourly")
    // pass
}

async function getJuneHourlyAvgPower(params) {
    // pass
}

/**
 * @param {array} solarData an array of the solar data. The data contains all the data of a
 * given time period.
 * @param {int,float,} tilt the tile angle of the sun
 * @param {int,float} azimuth the solar azimuth angle
 * @param {boolean} june true of false, if we say true the hourly data gets devided by 30
 */
function calculateAvgPower(solarData,tilt, azimuth,june){
    const hourlyPower = new Array(24).fill(0);

    for (const timestamp in solarData) {
        const data = JSON.parse(solarData[timestamp]);

        const GHI = data.ghi;
        //console.log("GHI:", GHI);

        const DHI = data.dhi;
        //console.log("DHI:", DHI);

        const DNI = data.dni;
        //console.log("DNI:", DNI);
        const SZA = data.zen;
        const SAA = data.azm;
        //the solar irradiance is in Wh/m^2

        // Calculate angle of incidence (θ)
        const theta = calculateAngleOfIncidence(tilt, azimuth, SZA, SAA);
        const power = calculatePower(theta, GHI, DHI, DNI, tilt); // Raw power calculation, returns Wh
        //console.log("Hourly Power:", power);

        // Update the hourly and maximum power values
        const hour = get_correct_dateTime_format(timestamp).getHours();
        hourlyPower[hour] = hourlyPower[hour] + power;
    }
    divisor = june ? 30 : 31;
    for (const index in hourlyPower){
        // const index = hourlyPower.indexOf(Number(sumOfPowers));
        hourlyPower[index] = hourlyPower[index] / divisor; // this will give us the avg power per hour in a span of 30/31 days
    }

    return hourlyPower;
    // return { maxPower, hourlyPower };
};

async function getJuneAndDecemberHourlyAvgPower(tilt, azimuth, lat, lng) { // this is cape town
    const decemberDataUrl = getApiUrl("20231201","20231231",lat,lng,"hourly");
    const juneDataUrl = getApiUrl("20230601","20230630",lat, lng,"hourly");

    try{
        const decemberData = await retrieveSolarData(decemberDataUrl,lat,lng);
        const juneData = await retrieveSolarData(juneDataUrl, lat, lng);

        const june = calculateAvgPower(juneData, tilt, azimuth,true);
        console.log("june avg", june)
        const december = calculateAvgPower(decemberData, tilt, azimuth, false);
        console.log("dec avg", december)

        return {june,december}; // the avg hourly power

    }catch( error){
        console.log("Either December or June Broke")
        return null;
    }
};

/**
 * returns a unique api for us to use for our get request
 * @param {String} startDate the start period of the data to request
 * @param {String} endDate the end period of the data to request
 * @param {*} lat the latitude of the location we want to get data of
 * @param {*} lng the longitude of the location we want to get data of
 * @param {String} period the type of data we want daily/hourly
 * @returns api url
 */
function getApiUrl(startDate, endDate, lat, lng, period) {
    const main_url = `https://power.larc.nasa.gov/api/temporal/${period}/point?`;
    const duration = `start=${startDate}&end=${endDate}`;
    const coord = `&latitude=${lat}&longitude=${lng}`;
    const parameters = `&community=re&parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DIFF,ALLSKY_SFC_SW_DNI&format=json&time-standard=lst`;
    const nasa_url = main_url + duration + coord + parameters;
    return nasa_url;
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

    //console.log("Inside the vip",vips)
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
        //console.log("GHI:", GHI);

        const DHI = data.dhi;
        //console.log("DHI:", DHI);

        const DNI = data.dni;
        //console.log("DNI:", DNI);
        const SZA = data.zen;
        const SAA = data.azm;
        //the solar irradiance is in Wh/m^2

        // Calculate angle of incidence (θ)
        const theta = calculateAngleOfIncidence(tilt, azimuth, SZA, SAA);
        const power = calculatePower(theta, GHI, DHI, DNI, tilt); // Raw power calculation, returns Wh
        //console.log("Hourly Power:", power);

        // Adjust power for shading using the new non-linear shading factor
        // const shading = parseFloat(document.getElementById('shading').value);
        // const shadingFactor = calculateShadingFactor(shading); // New shading factor
        // const powerWithShading = power * shadingFactor;

        // Update the hourly and maximum power values
        const hour = get_correct_dateTime_format(timestamp).getHours();
        // hourlyPower[hour] = Math.max(hourlyPower[hour], powerWithShading.toFixed(2));
        hourlyPower[hour] = Math.max(hourlyPower[hour], power.toFixed(2));
        if (power > maxPower) {
            // maxPower = powerWithShading;
            maxPower = power;
        }
    }
    return { maxPower, hourlyPower };
}



function calculatePower(theta,GHI,DHI,DNI,tilt){
    const panelArea = 4; // Updated area for a 1kW solar panel in m^2
    const panelEfficiency = 0.20; // Typical efficiency of a solar panel (20%)
    
    // Calculate beam irradiance on tilted surface (Gb)
    const Gb = DNI * Math.cos(theta);

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
        //console.error('Error fetching solar data:', error);
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
    // Initialize arrays to store monthly totals and counts
    const monthlyPower = Array(12).fill(0);
    const monthlyDays = Array(12).fill(0);

    // Process each timestamp in the solar data
    for (const timestamp in solarData) {
        try {
            const data = JSON.parse(solarData[timestamp]);
            const date = get_correct_dateTime_format(timestamp);
            const month = date.getMonth();

            // Validate required irradiance data

            const GHI = data.ghi;
            //console.log("GHI:", GHI);
    
            const DHI = data.dhi;
           // console.log("DHI:", DHI);
    
            const DNI = data.dni;
            //console.log("DNI:", DNI);
            const SZA = data.zen;
            const SAA = data.azm;
            //the solar irradiance 

            // Calculate solar position and angle of incidence
            const solarDeclination = solar_declination(date.getDate());
            console.log('solar declination',solarDeclination)
            const theta = calculateAngleOfIncidence(tilt, azimuth, SZA, SAA );
            //console.log("daily Power", dailyPower)

            // Calculate daily power output
            const dailyPower = calculatePower(theta, GHI, DHI, DNI, tilt);
            //console.log("daily Power", dailyPower)

            // Accumulate monthly totals
            if (dailyPower > 0) {
                monthlyPower[month] += dailyPower;
                monthlyDays[month]++;
            }
        } catch (error) {
            console.warn(`Error processing data for timestamp ${timestamp}`);
            continue;
        }
    }

    // Calculate and return monthly averages in the format expected by the chart
    return monthlyPower.map((power, month) => ({
        month: month,
        power: monthlyDays[month] > 0 ? power / monthlyDays[month] : 0
    }));
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
//createSunPathDiagram
function createSunPathDiagram(lat, lng) {
    const canvas = document.getElementById('sunPathDiagram');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    const isNorthernHemisphere = lat >= 0;
    const absLat = Math.abs(lat);
    const isNearPoles = absLat > 66.5;

    // Clear and set background
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f0f8ff';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 0.5;
    
    // Vertical time lines
    for (let hour = 0; hour <= 24; hour++) {
        const x = width * (hour / 24);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }

    // Horizontal altitude lines
    for (let altitude = 0; altitude <= 90; altitude += 15) {
        const y = height - (height * altitude / 90);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        
        if (altitude % 30 === 0) {
            ctx.fillStyle = 'black';
            ctx.font = '12px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(`${altitude}°`, 25, y + 4);
        }
    }

    // Path colors and labels
    const pathColors = {
        winter: '#0066cc',  // Blue
        equinox: '#009933', // Green
        summer: '#cc3300'   // Red
    };
    const seasonLabels = ['Winter', 'Spring/Fall', 'Summer'];

    function generateCartesianPoints(maxAltitude) {
        const points = [];
        for (let hour = 0; hour <= 24; hour += 0.25) {
            const timePosition = hour / 24;
            const angleRadians = (timePosition - 0.5) * 2 * Math.PI;
            const altitude = maxAltitude * Math.cos(angleRadians);
            
            // Include all points, not just above horizon
            points.push({
                x: width * timePosition,
                y: height - (height * Math.max(-5, altitude) / 90), // Limit how far below horizon we show
                hour,
                altitude
            });
        }
        return points;
    }

    function generateSunCalcPoints(date) {
        const points = [];
        for (let hour = 0; hour <= 24; hour += 0.25) {
            const currentDate = new Date(date);
            currentDate.setHours(hour, (hour % 1) * 60, 0);
            const sunPos = SunCalc.getPosition(currentDate, lat, lng);
            const altitude = sunPos.altitude * 180 / Math.PI;
            
            // Include all points, not just above horizon
            points.push({
                x: width * (hour / 24),
                y: height - (height * Math.max(-5, altitude) / 90), // Limit how far below horizon we show
                hour,
                altitude
            });
        }
        return points;
    }

    let paths;
    if (isNearPoles) {
        const year = new Date().getFullYear();
        const dates = isNorthernHemisphere ? [
            new Date(year, 11, 21),
            new Date(year, 2, 20),
            new Date(year, 5, 21)
        ] : [
            new Date(year, 5, 21),
            new Date(year, 2, 20),
            new Date(year, 11, 21)
        ];

        paths = [
            { type: 'winter', points: generateSunCalcPoints(dates[0]) },
            { type: 'equinox', points: generateSunCalcPoints(dates[1]) },
            { type: 'summer', points: generateSunCalcPoints(dates[2]) }
        ];
    } else {
        const summerSolsticeDeclination = 23.5;
        const winterSolsticeDeclination = -23.5;
        
        let summerAlt, winterAlt;
        if (isNorthernHemisphere) {
            summerAlt = 90 - absLat + summerSolsticeDeclination;
            winterAlt = 90 - absLat + winterSolsticeDeclination;
        } else {
            summerAlt = 90 - absLat - winterSolsticeDeclination;
            winterAlt = 90 - absLat - summerSolsticeDeclination;
        }
        const equinoxAlt = 90 - absLat;

        paths = [
            { type: 'winter', points: generateCartesianPoints(winterAlt) },
            { type: 'equinox', points: generateCartesianPoints(equinoxAlt) },
            { type: 'summer', points: generateCartesianPoints(summerAlt) }
        ];
    }

    // Draw paths
    paths.forEach(path => {
        ctx.strokeStyle = pathColors[path.type];
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        path.points.forEach((pos, i) => {
            if (i === 0) ctx.moveTo(pos.x, pos.y);
            else ctx.lineTo(pos.x, pos.y);
        });
        ctx.stroke();

        // Add time markers and labels for every hour
        path.points.filter(pos => Math.abs(pos.hour % 1) < 0.01).forEach(pos => {
            // Draw dot
            ctx.fillStyle = pathColors[path.type];
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, 3, 0, 2 * Math.PI);
            ctx.fill();

            // Add time label
            ctx.fillStyle = 'black';
            ctx.font = '12px Arial';
            ctx.textAlign = 'center';
            const timeLabel = `${String(Math.floor(pos.hour)).padStart(2, '0')}:00`;
            // Adjust label position based on path location
            const labelY = pos.y - 10;
            ctx.fillText(timeLabel, pos.x, labelY);
        });
    });

    // Draw horizon line
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width, height);
    ctx.stroke();

    // Add cardinal directions
    ctx.fillStyle = 'black';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('E', width * 0.25, height - 50);
    ctx.fillText(isNorthernHemisphere ? 'N' : 'S', width * 0.5, height - 50);
    ctx.fillText('W', width * 0.75, height - 50);

    // Add labels
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Zenith', 10, 25);
    ctx.fillText('Horizon', 10, height - 5);

    // Add legend
    ctx.font = 'bold 14px Arial';
    seasonLabels.forEach((season, i) => {
        ctx.fillStyle = Object.values(pathColors)[i];
        const y = 60 + i * 20;
        ctx.fillRect(width - 120, y - 10, 15, 15);
        ctx.fillStyle = 'black';
        ctx.fillText(season, width - 100, y);
    });
}
// Add this CSS to your stylesheet or add it inline in your HTML
function initMap() {
    map = L.map('map').setView([-33.9344,18.8640], 9);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
    }).addTo(map);

    // Create a div for coordinates
    const coordsDiv = L.DomUtil.create('div', 'leaflet-control');
    coordsDiv.style.backgroundColor = 'black';
    coordsDiv.style.padding = '5px 10px';
    coordsDiv.style.margin = '10px';
    coordsDiv.style.border = '2px solid rgba(0,0,0,0.2)';
    coordsDiv.style.borderRadius = '4px';
    coordsDiv.style.fontSize = '14px';
    coordsDiv.innerHTML = 'Latitude: -33.9344°';

    // Create a control and add the div to it
    const coordsControl = L.Control.extend({
        options: {
            position: 'bottomleft'
        },
        onAdd: function() {
            return coordsDiv;
        }
    });

    // Add control to map
    new coordsControl().addTo(map);

    // Update coordinates only on click
    map.on('click', function(e) {
        coordsDiv.innerHTML = `Latitude: ${e.latlng.lat.toFixed(4)}°`;
    });


    map.on('click', onMapClick);
    // Initial marker
    marker = L.marker([-33.9344,18.8640]).addTo(map);
    updateLocation(-33.9344,18.8640);
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
                maxPowerWithParameters(maxPower,false);
                maxPowerWithParameters(maxPower,true);
            }
            getJuneAndDecemberHourlyAvgPower(tilt, azimuth, lat, lng);
            updatePowerChart(lat, lng, tilt, azimuth)           
             updateMonthlyPowerChart(monthlyAveragePower);

        } else {
            console.error('No solar data available or empty data set');
            document.getElementById('peakPower').innerText = 'N/A: No data available';
        }

        map.setView([lat, lng], map.getZoom());
    } catch (error) {
        //console.error('Error updating location:', error);
        //document.getElementById('peakPower').innerText = 'Error: ' + error.message;
    }
    // calculateAvgPower()

    const tilt = document.getElementById('tilt').value;
    const azimuth = document.getElementById('azimuth').value;

    /* TODO: fix this plot the hourly averages. method returns June and December as a list  */
    initSolarDiagram();
    updateSolarDiagram(tilt, azimuth);
    createSunPathDiagram(lat, lng);
}



/**
 * Modifies the Power output on the Peak Power Generation Card.  The card has two extra parameters
 * shading and soiling. Each changes the power respectively
 * @param {Number} maxPower the maximum power of the location
 * @param {boolean} shading if set true, we will run the shadingFactor method, else we will run the soiling factor calculation
 */
function maxPowerWithParameters(maxPower) {
    // Get both soiling and shading values
    const soilingValue = parseFloat(document.getElementById("soiling").value) || 0;
    const shadingValue = parseFloat(document.getElementById("shading").value) || 0;

    // Calculate combined power output
    let power = maxPower;
    
    if (soilingValue > 0 || shadingValue > 0) {
        // Apply soiling reduction
        power *= (1 - soilingValue);
        
        // Apply shading reduction
        if (shadingValue > 0) {
            power *= calculateShadingFactor(shadingValue);
        }
        
        // Ensure power doesn't go negative
        power = Math.max(0, power);
    }
    
    // Format to 2 decimal places
    power = power.toFixed(2);
    
    // Update the display
    document.getElementById("combinedPower").innerHTML = power;
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
                maxPowerWithParameters(maxPower,false);
                maxPowerWithParameters(maxPower,true);

            }
            
            updatePowerChart(lat, lng, tilt, azimuth);
            const monthlyAveragePower = calculateMonthlyAverages(dailyData, tilt, azimuth, lat);
            updateMonthlyPowerChart(monthlyAveragePower);

        } else {
            console.error('No solar data available or empty data set');
            document.getElementById('peakPower').innerText = 'N/A: No data available';
        }

        map.setView([lat, lng], map.getZoom());
    } catch (error) {
        console.error('Error updating location:', error);
        // document.getElementById('peakPower').innerText = 'Error: ' + error.message;
    }

    initSolarDiagram(); // Add this line
    updateSolarDiagram(tilt, azimuth);
    createSunPathDiagram(lat, lng);
}



let isUpdating = false;
let updateTimeout;

function updateControls(skipUpdates = false) {
    // Clear any pending timeout
    clearTimeout(updateTimeout);

    // Get all control values
    const azimuth = parseFloat(document.getElementById('azimuth').value);
    const tilt = parseFloat(document.getElementById('tilt').value);
    const soiling = parseFloat(document.getElementById('soiling').value);
    const shading = parseFloat(document.getElementById('shading').value);

    // Update UI values immediately
    document.getElementById('azimuthValue').textContent = azimuth;
    document.getElementById('tiltValue').textContent = tilt;
    document.getElementById('soilingValue').textContent = soiling;
    document.getElementById('shadingValue').textContent = shading + '%';

    // Update solar diagram
    updateSolarDiagram(tilt, azimuth);

    // Skip the heavy calculations if this is the initial load
    if (skipUpdates) return;

    // Debounce heavy calculations
    updateTimeout = setTimeout(() => {
        if (!isUpdating) {
            isUpdating = true;

            // Get location
            const [lat, lng] = document.getElementById('location').value.split(',').map(coord => parseFloat(coord.trim()));

            // Perform calculations
            updatePeakPowerByControl(lat, lng, azimuth, tilt)
                .finally(() => {
                    isUpdating = false;
                });
        }
    }, 3000);
}



function initSolarDiagram() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x353553);

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
    context.font = '80px Arial'; // Increase font size
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
    const normalizedAzimuth = (azimuth + 360) % 360;

    // Convert degrees to radians
    const tiltRad = THREE.MathUtils.degToRad(tilt);
    const azimuthRad = THREE.MathUtils.degToRad(normalizedAzimuth + 44);

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


async function updatePowerChart(lat, lng, tilt, azimuth) {
    const ctx = document.getElementById('powerChart').getContext('2d');
    const isNorthernHemisphere = lat > 0;

    // Get shading and soiling values
    const soilingValue = parseFloat(document.getElementById("soiling").value);
    const shadingValue = parseFloat(document.getElementById("shading").value);

    // Get June and December data using your existing function
    const { june, december } = await getJuneAndDecemberHourlyAvgPower(tilt, azimuth, lat, lng);

    // Apply soiling and shading reductions
    const applySoilingAndShading = (powerArray) => {
        return powerArray.map(power => {
            let adjustedPower = power;
            
            // Apply soiling reduction
            if (soilingValue > 0) {
                adjustedPower *= (1 - soilingValue);
            }
            
            // Apply shading reduction
            if (shadingValue > 0) {
                adjustedPower *= calculateShadingFactor(shadingValue);
            }
            
            // Ensure power doesn't go negative
            return Math.max(0, adjustedPower);
        });
    };

    // Determine which month represents summer/winter based on hemisphere
    const summerPower = applySoilingAndShading(isNorthernHemisphere ? june : december);
    const winterPower = applySoilingAndShading(isNorthernHemisphere ? december : june);

    // If there's already a chart, destroy it before creating a new one
    if (powerChart) {
        powerChart.destroy();
    }

    // Create new chart with updated data
    powerChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0') + ':00'),
            datasets: [
                {
                    label: 'Summer Average Power (W)',
                    data: summerPower,
                    borderColor: 'rgb(255, 0, 0)', // Red for summer
                    backgroundColor: 'rgba(255, 0, 0, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                },
                {
                    label: 'Winter Average Power (W)',
                    data: winterPower,
                    borderColor: 'rgb(0, 0, 255)', // Blue for winter
                    backgroundColor: 'rgba(0, 0, 255, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                }
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Power (W)',
                        color: '#ffffff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                    },
                    ticks: {
                        color: '#ffffff'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Hour of the Day',
                        color: '#ffffff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                    },
                    ticks: {
                        color: '#ffffff'
                    }
                },
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#ffffff',
                        padding: 20,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                },
                title: {
                    display: true,
                    text: `${isNorthernHemisphere ? 'Northern' : 'Southern'} Hemisphere - Seasonal Power Comparison`,
                    color: '#ffffff',
                    font: {
                        size: 14
                    }
                }
            },
        },
    });
}

// Add event listeners to update the chart when soiling or shading changes
document.getElementById("soiling").addEventListener('input', () => {
    // Assuming you have existing latitude, longitude, tilt, and azimuth variables
    updatePowerChart(latitude, longitude, tilt, azimuth);
});

document.getElementById("shading").addEventListener('input', () => {
    // Assuming you have existing latitude, longitude, tilt, and azimuth variables
    updatePowerChart(latitude, longitude, tilt, azimuth);
});

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
                label: 'Average Daily Energy Output (kWh/day)',
                data: monthlyAveragePower.map(d => d.power.toFixed(2)),
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgb(75, 192, 192)',
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Average Daily Energy Output (kWh/day)',
                        color: '#ffffff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                    },
                    ticks: {
                        color: '#ffffff'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Month',
                        color: '#ffffff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)',
                    },
                    ticks: {
                        color: '#ffffff'
                    }
                },
            },
            plugins: {
                legend: {
                    display: false,
                    position: 'top',
                    labels: {
                        color: '#ffffff',
                        padding: 20,
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
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


        function onMapClick(e) {
            var lat = e.latlng.lat;
            var lng = e.latlng.lng;
            marker.setLatLng([lat, lng]); // Update the marker's position
            updateLocation(lat, lng);
        }

        window.onload = async () => {
            // Initialize the map first
            initMap();
            
            // Initialize diagrams and UI elements
            initSolarDiagram();
            updatePowerChart();
            updateMonthlyPowerChart();
            // Update controls without triggering heavy calculations
            updateControls(true);
            
            // Initialize location input
            initializeLocationInput();
            
            // Get initial location
            const locationInput = document.getElementById('location');
            const [lat, lng] = locationInput.value.split(',').map(coord => parseFloat(coord.trim()));
            
            // Do a single update of all calculations and charts
            await updatePeakPowerByControl(lat, lng, 
                parseFloat(document.getElementById('azimuth').value),
                parseFloat(document.getElementById('tilt').value)
            );
            
            // Update financial aspects last
            updateFinancialAspects();
        };