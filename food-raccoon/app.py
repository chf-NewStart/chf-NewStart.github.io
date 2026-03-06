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


def map_preference_to_keywords(preference: str) -> str:

    if not preference:
        return "美食"

    prompt = f"""
User food craving: "{preference}"

Convert this craving into Chinese cuisine keywords suitable for searching restaurants on AMap.

Return only 3–5 short keywords separated by spaces.

Examples:
spicy food -> 川菜 火锅 湘菜 麻辣烫
sweet dessert -> 甜品 奶茶 蛋糕
noodles -> 面馆 拉面 牛肉面
barbecue -> 烧烤 烤串

Output ONLY the keywords.
"""

    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2
    )

    keywords = response.choices[0].message.content.strip()

    return keywords

def map_preference_to_keywords(preference: str):

    try:

        prompt = f"""
Convert this food craving into Chinese cuisine search keywords for restaurants:

{preference}

Return 3-5 Chinese cuisine keywords separated by spaces.
"""

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2
        )

        return response.choices[0].message.content.strip()

    except Exception:

        return preference or "美食"
    
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
        location = (data.get("location") or "").strip() or "北京市"
        travel_mode = (data.get("travel_mode") or "walking").strip()

        keywords = map_preference_to_keywords(preference)

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