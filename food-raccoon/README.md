# Food Raccoon backend

The static page is safe to publish, but the optional Flask backend calls paid
AMap and DeepSeek services. Credentials are read only from environment
variables; they must never be committed to this repository.

```sh
export AMAP_API_KEY='your-new-amap-key'
export DEEPSEEK_API_KEY='your-new-deepseek-key'
python app.py
```

The backend is intentionally limited to localhost by default, allows only the
configured origins, and rate-limits paid routes. If you deploy it, set an
explicit origin allowlist, add provider-side quotas/restrictions, and put it
behind authentication or a trusted server-side proxy.
