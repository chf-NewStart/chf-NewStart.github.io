# Literature Review — *Tomato volume and mass estimation using computer vision and machine learning algorithms: Cherry tomato model*

https://www.sciencedirect.com/science/article/pii/S0260877419302973?via%3Dihub 

## 1) One-screen high-level summary

**fruit image/depth image → geometric features → fruit mass / fruit volume**  
**Best fit:** **Layer 2 – Biomass Estimation**  
**Also useful for:** **Layer 3 – Bridging features with biomass**  
**Not a fit for:** **Layer 2 – Segmentation of leaf/stem/fruit**  

- ❌ No whole-plant analysis
- ❌ No organ segmentation into leaf / stem / fruit
- ❌ No per-organ biomass for the full tomato plant
- ❌ Not about shoot biomass or plant biomass
- ✅ Very strong for **fruit-level mass estimation**
- ✅ Very strong for **geometry-based biomass proxy estimation**
- ✅ Strong example of **vision features → regression model → mass**
- ✅ Useful for your **fruit biomass branch**
- ⚠️ Only works on **isolated cherry tomatoes**
- ⚠️ Uses **post-harvest controlled imaging**, not in-field plant images
- ⚠️ Mostly about **fruit grading/sorting**, not biological organ understanding

Paper text you uploaded: :contentReference[oaicite:0]{index=0}

---

## 2) My verdict for your project

This paper is **useful, but only for a narrow part of your project**.

If your project is:

**image → classify tomato organs → estimate biomass**

then this paper helps mainly with:

**fruit image → fruit geometric features → fruit mass**

So I would label it as:

### Best layer fit
**Layer 2 – Biomass Estimation**

### Secondary fit
**Layer 3 – Bridging segmentation/features with biomass**

### Weak fit
**Layer 2 – Segmentation**

Because this paper does not try to separate leaf, stem, and fruit at all. It assumes the fruit is already isolated and then predicts **mass** and **volume** from image-derived 2D and 3D features. :contentReference[oaicite:1]{index=1}

---

## 3) What the paper is actually doing

The paper develops a **computer vision system** to estimate **mass** and **volume** of **cherry tomatoes** using image features and machine learning. The main objectives were:

1. develop a depth-image processing algorithm  
2. extract both 2D and 3D features  
3. train regression models for mass and volume  
4. study the relationship between tomato mass and volume :contentReference[oaicite:2]{index=2}

So the logic is:

**isolated cherry tomato → image preprocessing → 2D/3D geometric features → regression model → mass / volume**

This is much closer to **fruit grading** than to full plant phenotyping. :contentReference[oaicite:3]{index=3}

---

## 4) Why it matters

This paper matters because it gives a very clean example of a **feature-based biomass estimation pipeline**.

It shows that you do not always need deep end-to-end learning. Instead, you can do:

- capture image/depth
- extract meaningful geometric descriptors
- train regression model
- estimate physical quantity such as mass or volume

That is very relevant to your project conceptually, because your project also needs a final step like:

**organ features → organ biomass**

This paper is a simpler version of that idea, but only for **fruit**. :contentReference[oaicite:4]{index=4}

---

## 5) Core pipeline in simple words

### Step 1 — Collect ground-truth labels
They physically measured each cherry tomato’s:

- **mass**, using an electronic scale with ±0.1 g accuracy
- **volume**, using water displacement method (WDM) :contentReference[oaicite:5]{index=5}

This is important because the ML model is supervised.  
So the target is real measured mass/volume, not an estimated pseudo-label.

---

### Step 2 — Capture images
They used a **Kinect 2.0 depth sensor** mounted above a conveyor setup. Each tomato was imaged in **three orientations**, with **9 images total per tomato**. Depth images were **424 × 512 pixels** and acquired at **10 frames per minute**. :contentReference[oaicite:6]{index=6}

---

### Step 3 — Preprocess images
They did:

- background subtraction
- distance thresholding
- Gaussian smoothing
- morphological opening
- binarization with Otsu’s method :contentReference[oaicite:7]{index=7}

This gave them a clean ROI for each fruit.

---

### Step 4 — Extract features
They extracted:

#### 2D features
- projected area
- perimeter
- eccentricity
- major-axis length
- minor-axis length
- radial distance

#### 3D features
- surface area
- volume :contentReference[oaicite:8]{index=8}

So total feature groups were:

- **M1** = only 2D features
- **M2** = only 3D features
- **M3** = both 2D + 3D features :contentReference[oaicite:9]{index=9}

---

### Step 5 — Train regression models
They trained:

- SVM with linear kernel
- SVM with quadratic kernel
- SVM with cubic kernel
- SVM with RBF kernel
- Bayesian-ANN :contentReference[oaicite:10]{index=10}

They used 10-fold cross-validation for training/tuning, with dataset split:

- 70% training
- 30% testing/validation :contentReference[oaicite:11]{index=11}

---

## 6) What exact ML / modeling methods they used

This paper actually used **two different routes** for mass estimation.

### Route A — Direct regression from image features
Predict **mass** or **volume** directly from 2D / 3D image features using:

- SVM variants
- Bayesian-ANN :contentReference[oaicite:12]{index=12}

This is the main machine-learning route.

---

### Route B — Mass-volume power law
They also fit a **power function** between measured volume and measured mass, then used that to estimate mass from volume. The paper reports that this mass-volume relation achieved **R² = 0.9751** when fit on measured data, and on a test set mass estimation reached **R² = 0.9824** with **RMSE ≈ 15.82 g**. :contentReference[oaicite:13]{index=13}

So there are really two ideas here:

1. **image features → ML model → mass/volume**
2. **volume → power equation → mass**

That is why this paper is nice: it mixes **physics-ish geometric relation** with **ML regression**.

---

## 7) Main results

The paper reports that all explored models achieved **R² > 0.92**. :contentReference[oaicite:14]{index=14}

More specifically:

### Best mass estimation
- **RBF-SVM with M1 (2D features only)** achieved **R² = 0.9706** for mass estimation. :contentReference[oaicite:15]{index=15}

### Best volume estimation
- **RBF-SVM with M3 (2D + 3D features)** achieved **R² = 0.9694** for volume estimation. :contentReference[oaicite:16]{index=16}

### Bayesian-ANN also performed strongly
- For some setups it outperformed SVM, especially in certain mass/volume combinations. :contentReference[oaicite:17]{index=17}

### Practical interpretation
- For **mass**, 2D features alone were already very strong.
- For **volume**, combining 2D and 3D features was best. :contentReference[oaicite:18]{index=18}

This is a surprisingly useful insight:
**mass does not necessarily need full 3D richness if 2D shape cues are already strong enough.**

---

## 8) What features they used

This is one of the most useful parts for your project.

### 2D features
These describe the fruit silhouette / projected geometry:

- projected area
- perimeter
- eccentricity
- major-axis length
- minor-axis length
- radial distance :contentReference[oaicite:19]{index=19}

### 3D features
These describe fruit shape in depth space:

- surface area
- volume :contentReference[oaicite:20]{index=20}

### Interpretation
These are all **engineered geometric features**, not deep learned features.

So this paper is a classic:

**computer vision + feature engineering + regression**

paper, not an end-to-end CNN paper.

---

## 9) Equipment, imaging setup, software, packages

### Hardware
- **Kinect 2.0** depth sensor
- mounted **0.7 m above** conveyor belt
- PC with **Intel i7-4700HQ, 2.4 GHz, 16 GB RAM**
- Windows 10 :contentReference[oaicite:21]{index=21}

### Image specs
- depth image size: **424 × 512 pixels**
- acquisition rate: **10 fpm**
- 9 images per fruit
- 3 orientations per fruit :contentReference[oaicite:22]{index=22}

### Software
- **MATLAB R2019a**
- Kinect for Windows SDK
- Image Acquisition Toolkit
- Neural Network Toolbox
- Curve Fitting Toolbox
- Microsoft Excel analysis toolpack for descriptive stats :contentReference[oaicite:23]{index=23}

### Ground-truth measurement tools
- calibrated electronic scale
- water displacement method (WDM) for volume :contentReference[oaicite:24]{index=24}

---

## 10) Dataset size and sampling

The paper used:

- **300 fresh cherry tomatoes** overall
- but image-level dataset became **958 samples**, because multiple images/orientations were used
- training set: **671**
- test/validation set: **287** :contentReference[oaicite:25]{index=25}

This matters because the model is not trained on only 300 rows in the final sense; multiple orientations expand the usable image sample count.

---

## 11) Strengths of the paper

### Strength 1 — Very clear feature-to-mass pipeline
This is a strong paper if you want an example of:

**vision features → regression → physical quantity**

It is simple, interpretable, and easy to reproduce conceptually. :contentReference[oaicite:26]{index=26}

### Strength 2 — Good practical accuracy
R² values above 0.92, with best around 0.97, are quite strong for non-destructive fruit mass/volume estimation. :contentReference[oaicite:27]{index=27}

### Strength 3 — Uses low-cost depth hardware
Using Kinect makes this more practical than very expensive 3D scanners. :contentReference[oaicite:28]{index=28}

### Strength 4 — Compares 2D-only, 3D-only, and combined features
This is very useful scientifically because it tells you what feature space contributes most. :contentReference[oaicite:29]{index=29}

### Strength 5 — Good for post-harvest automation
The paper is clearly relevant for in-line sorting and grading systems. :contentReference[oaicite:30]{index=30}

---

## 12) Weaknesses / limitations

### Limitation 1 — Only isolated fruit
This is not a plant phenotyping paper. It does not deal with fruit attached to plant, occlusion, leaves, stems, or cluttered greenhouse scenes.

### Limitation 2 — No organ segmentation
For your project, this is a big gap. The fruit is already isolated, so the hard part of plant organ separation is skipped entirely.

### Limitation 3 — Cherry tomato only
The paper explicitly says the mass-volume relationship is specific to the cherry tomato class studied, and may not transfer directly to larger tomato varieties because internal structure differs. :contentReference[oaicite:31]{index=31}

### Limitation 4 — Density assumption
Part of the mass-from-volume reasoning assumes near-constant fruit density, which is not always true across growing systems or fruit types. :contentReference[oaicite:32]{index=32}

### Limitation 5 — Post-harvest controlled setting
This is not field-robust, greenhouse-robust, or canopy-robust.

---

## 13) Exactly how it relates to your agrifood project

Your project is roughly:

**whole plant image → classify organs (leaf/stem/fruit) → estimate biomass**

This paper is only directly relevant to the **fruit branch** of that pipeline.

### What it gives you
- a concrete example of **feature engineering for biomass-related estimation**
- ideas for **fruit-level geometry features**
- evidence that **mass can be estimated from vision**
- evidence that simple engineered features can work very well

### What it does not give you
- leaf biomass estimation
- stem biomass estimation
- organ segmentation model
- in-plant fruit mass estimation under occlusion
- whole-plant biomass modeling

---

## 14) Best layer mapping for your project

### Layer 1 – End-to-End
**Weak fit**

Because it is not:
- whole plant
- multi-organ
- segmentation-to-biomass pipeline

---

### Layer 2 – Segmentation
**Very weak fit**

Because the fruit is already isolated.

---

### Layer 2 – Feature / Phenotyping
**Moderate fit**

Because it uses hand-crafted 2D/3D geometric fruit descriptors.

---

### Layer 2 – Biomass Estimation
**Strong fit**

Because the main contribution is estimating fruit mass/volume from image features.

---

### Layer 3 – Bridging features with biomass
**Strong fit**

Because it clearly demonstrates:

**features → regression model → mass**

---

## 15) Clean label you can use

**fruit-level geometric feature to mass/volume estimation**  
**Corresponds to Layer 2 Biomass Estimation + Layer 3 Bridging**

A compact version:

- ❌ No leaf/stem/fruit segmentation
- ❌ No whole-plant biomass
- ❌ No per-organ plant decomposition
- ✅ Strong for fruit mass estimation
- ✅ Strong for feature-to-biomass bridging
- ✅ Strong for post-harvest grading/sorting
- ⚠️ Only isolated cherry tomatoes
- ⚠️ Controlled setup with Kinect depth sensor
- ⚠️ Indirectly useful for your project, mainly for the fruit branch

---

## 16) What you should put on 1–2 slides for your professor

## Slide 1 — What the paper does
**Title:** Cherry tomato mass and volume estimation from 2D/3D image features

Put:
- Goal: estimate fruit mass and volume non-destructively
- Input: Kinect depth images of isolated cherry tomatoes
- Features:
  - 2D: area, perimeter, eccentricity, major/minor axis, radial distance
  - 3D: surface area, volume
- Models:
  - SVM (linear/quadratic/cubic/RBF)
  - Bayesian-ANN
  - power-law mass-volume model
- Best results:
  - mass: RBF-SVM, 2D only, R² = 0.9706
  - volume: RBF-SVM, 2D+3D, R² = 0.9694 :contentReference[oaicite:33]{index=33}

---

## Slide 2 — Why it matters / limits for our project
**Title:** Relevance to tomato organ biomass project

Put:
- Useful because:
  - shows image-derived geometric features can predict fruit mass
  - good example of feature-engineered regression
  - useful for fruit biomass submodule
- Not enough because:
  - no leaf/stem/fruit segmentation
  - no whole-plant context
  - only isolated cherry tomatoes
- Takeaway:
  - after segmentation, similar feature-based regression could be used for fruit biomass estimation in our project

---

## 17) Expanded talking points for the slides

### Slide 1 speaker note
This paper builds a post-harvest vision system for estimating cherry tomato mass and volume. It uses depth images, extracts 2D and 3D geometric features, and trains regression models such as RBF-SVM and Bayesian-ANN. The best mass model achieved R² around 0.97, showing that simple geometric descriptors can estimate fruit physical properties accurately. :contentReference[oaicite:34]{index=34}

### Slide 2 speaker note
For our project, this is not a segmentation paper and not a full plant biomass paper. But it is still useful because it demonstrates the final bridge from image features to biomass-related output. In our pipeline, once fruit regions are segmented, a similar regression approach could be used to estimate fruit biomass. However, we would still need separate solutions for leaf and stem, and we would need models that work under natural plant occlusion. :contentReference[oaicite:35]{index=35}

---

## 18) Dataset / code availability

From the text you uploaded, I do **not** see a public code repository or public downloadable dataset link explicitly provided in the paper text. The paper describes its collected dataset and experimental protocol, but no GitHub or open benchmark link is listed in the provided text. :contentReference[oaicite:36]{index=36}

So the safe answer is:

- **Dataset:** private experimental dataset collected by authors
- **Code:** not publicly linked in the provided text
- **Reproducibility:** moderate, because methods are described, but dataset/code availability appears limited in the text you shared

---

## 19) What they used — equipment / software / package summary

### Imaging equipment
- Kinect 2.0 depth sensor
- conveyor belt scanning stage
- 0.7 m camera distance
- 424 × 512 depth images
- 3 orientations, 9 images per fruit

### Ground truth
- electronic scale
- water displacement method

### Software
- MATLAB R2019a
- Kinect SDK
- Image Acquisition Toolkit
- Neural Network Toolbox
- Curve Fitting Toolbox
- Excel analysis toolpack

### Modeling
- SVM kernels: linear, quadratic, cubic, RBF
- Bayesian-ANN
- power regression for mass-volume relation 

---

## 20) Final verdict

### Is this paper useful?
**Yes — but mainly for fruit-level biomass estimation, not for the whole project.**

### Best summary sentence
This paper is a strong reference for **isolated cherry tomato fruit mass/volume estimation from geometric image features**, but it does **not** address plant organ segmentation or whole-plant biomass decomposition.

### Best place in your literature review
Put it under:

**Layer 2 – Biomass Estimation**  
and maybe mention again under  
**Layer 3 – Bridging features with biomass**

---

## 21) Copy-paste short version for notes

- **Paper type:** fruit-level mass/volume estimation
- **Input:** depth images of isolated cherry tomatoes
- **Features:** area, perimeter, eccentricity, axis lengths, radial distance, surface area, volume
- **Models:** SVM, Bayesian-ANN, mass-volume power model
- **Best result:** R² about 0.97
- **Best fit layer:** Layer 2 Biomass Estimation
- **Useful for us:** fruit biomass branch
- **Not useful for us:** segmentation, leaf/stem biomass, whole plant pipeline
- **Main limitation:** isolated cherry tomato only, controlled setup
