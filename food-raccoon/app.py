import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

AMAP_KEY = "e053b682f51ae08601c242e65c1b3ae7"

from openai import OpenAI

client = OpenAI(
    api_key="sk-90db7fa8a7684d0bafb40cdda2fc52eb",
    base_url="https://api.deepseek.com"
)

@app.route("/", methods=["GET"])
def home():
    return """
    <h2>FoodRaccoon backend is running.</h2>
    <p>Use POST /recommendations for API calls.</p>
    <p>Try GET <a href="/test">/test</a> for a quick backend test.</p>
    """


@app.route("/test", methods=["GET"])
def test():
    return jsonify({
        "success": True,
        "message": "Backend test route works."
    })

@app.route("/reverse_geocode", methods=["GET"])
def reverse_geocode():
    try:
        lat = request.args.get("lat", "").strip()
        lng = request.args.get("lng", "").strip()

        if not lat or not lng:
            return jsonify({
                "success": False,
                "error": "Missing lat/lng"
            }), 400

        url = "https://restapi.amap.com/v3/geocode/regeo"
        params = {
            "key": AMAP_KEY,
            "location": f"{lng},{lat}"
        }

        res = requests.get(url, params=params, timeout=10).json()

        if res.get("status") != "1":
            return jsonify({
                "success": False,
                "error": "Reverse geocoding failed",
                "amap_response": res
            }), 400

        address = res.get("regeocode", {}).get("formatted_address", "")

        return jsonify({
            "success": True,
            "address": address
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500
    
def fallback_keywords(preference: str) -> str:
    p = (preference or "").lower().strip()

    if not p:
        return "美食"
    if "spicy and sour" in p or ("spicy" in p and "sour" in p):
        return "酸菜鱼 川菜 贵州菜"
    if "spicy" in p or "辣" in p:
        return "川菜 火锅 湘菜 麻辣烫"
    if "sweet" in p or "甜" in p:
        return "甜品 奶茶 蛋糕"
    if "sour" in p or "酸" in p:
        return "酸菜鱼 贵州菜 云南菜"
    if "bbq" in p or "barbecue" in p or "烧烤" in p:
        return "烧烤 烤串 夜宵"
    if "noodle" in p or "面" in p:
        return "面馆 拉面 牛肉面"
    if "hotpot" in p or "火锅" in p:
        return "火锅"
    return "美食"

def map_preference_to_keywords(preference: str) -> str:
    preference = (preference or "").strip()

    if not preference:
        return "美食"

    try:
        prompt = f"""
You convert user food cravings into search keywords for AMap restaurant search in mainland China.

User craving:
{preference}

Rules:
1. Output ONLY simplified Chinese.
2. Output ONLY 3 to 5 short restaurant-search keywords.
3. Separate keywords with spaces.
4. No English.
5. No quotes.
6. No commas.
7. No explanation.
8. Prefer cuisine or dish/category words that Chinese users actually search on maps.

Good outputs:
川菜 火锅 湘菜 麻辣烫
甜品 奶茶 蛋糕
面馆 拉面 牛肉面
烧烤 烤串 夜宵
酸菜鱼 贵州菜 云南菜

Bad outputs:
"Sweet and sour Chinese"
Sweet and sour pork
Chinese restaurant
I recommend these keywords

Now output ONLY the keywords.
"""

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1
        )

        keywords = response.choices[0].message.content.strip()

        # cleanup
        keywords = keywords.replace(",", " ")
        keywords = keywords.replace("，", " ")
        keywords = keywords.replace('"', "")
        keywords = keywords.replace("'", "")
        keywords = " ".join(keywords.split())

        # if model still returns too much English, force fallback
        ascii_count = sum(1 for ch in keywords if ord(ch) < 128)
        if len(keywords) > 0 and ascii_count / len(keywords) > 0.5:
            return fallback_keywords(preference)

        return keywords if keywords else fallback_keywords(preference)

    except Exception:
        return fallback_keywords(preference)
    

    
@app.route("/recommendations", methods=["GET"])
def recommendations_get_help():
    return jsonify({
        "success": False,
        "error": "This endpoint requires POST, not GET."
    }), 405


@app.route("/recommendations", methods=["POST"])
def recommendations():
    try:
        data = request.get_json(silent=True) or {}

        preference = (data.get("preference") or "").strip()
        lat = (data.get("lat") or "").strip()
        lng = (data.get("lng") or "").strip()
        location = (data.get("location") or "").strip()
        travel_mode = (data.get("travel_mode") or "walking").strip()
                
        if lat and lng:
            user_location = f"{lng},{lat}"

            # reverse geocode to get city/province
            regeo_url = "https://restapi.amap.com/v3/geocode/regeo"
            regeo_params = {
                "key": AMAP_KEY,
                "location": user_location
            }

            regeo_res = requests.get(regeo_url, params=regeo_params, timeout=10).json()

            if regeo_res.get("status") != "1":
                return jsonify({
                    "success": False,
                    "error": "Failed to reverse geocode coordinates",
                    "amap_response": regeo_res
                }), 400

            comp = regeo_res.get("regeocode", {}).get("addressComponent", {})
            city = comp.get("city") or comp.get("province") or ""
        else:
            location = location or "北京市"

            geo_url = "https://restapi.amap.com/v3/geocode/geo"
            geo_params = {
                "key": AMAP_KEY,
                "address": location
            }

            geo_res = requests.get(geo_url, params=geo_params, timeout=10).json()

            if geo_res.get("status") != "1" or not geo_res.get("geocodes"):
                return jsonify({
                    "success": False,
                    "error": "Failed to geocode location",
                    "amap_response": geo_res
                }), 400

            geocode = geo_res["geocodes"][0]
            user_location = geocode.get("location", "")
            city = geocode.get("city") or geocode.get("province") or ""


        keywords = map_preference_to_keywords(preference)
        print("USER PREFERENCE:", preference)
        print("KEYWORDS SENT TO AMAP:", keywords)

        geo_url = "https://restapi.amap.com/v3/geocode/geo"
        geo_params = {
            "key": AMAP_KEY,
            "address": location
        }

        geo_res = requests.get(geo_url, params=geo_params, timeout=10).json()

        if geo_res.get("status") != "1" or not geo_res.get("geocodes"):
            return jsonify({
                "success": False,
                "error": "Failed to geocode location",
                "amap_response": geo_res
            }), 400

        geocode = geo_res["geocodes"][0]
        city = geocode.get("city") or geocode.get("province") or ""

        place_url = "https://restapi.amap.com/v3/place/text"
        place_params = {
            "key": AMAP_KEY,
            "keywords": keywords,
            "city": city,
            "offset": 5
        }

        place_res = requests.get(place_url, params=place_params, timeout=10).json()

        if place_res.get("status") != "1":
            return jsonify({
                "success": False,
                "error": "Restaurant search failed",
                "amap_response": place_res
            }), 400

        restaurants = []
        for p in place_res.get("pois", []):
            restaurants.append({
                "Name": p.get("name", "Unknown"),
                "Rating": 4.0,
                "Reviews": 100,
                "Categories": p.get("type", ""),
                "Address": p.get("address", ""),
                "TravelTime": "unknown",
                "TravelMode": travel_mode,
                "Price": "$$",
                "URL": "",
                "Image": ""
            })

        return jsonify({
            "success": True,
            "refined_query": keywords,
            "recommendations": restaurants
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


if __name__ == "__main__":
    app.run(debug=True)