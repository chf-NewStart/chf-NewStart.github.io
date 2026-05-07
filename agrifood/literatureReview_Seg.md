# Literature Review — *Accurate organ segmentation and phenotype extraction of tomato plants based on deep learning and clustering algorithm*

## Quick verdict

- ❌ **NO direct biomass data**
- ✅ **VERY strong for tomato organ detection / segmentation**
- ✅ **Very relevant for stem–leaf separation in tomato**
- ✅ **Useful for extracting organ-level geometric traits**
- ⚠️ **Indirectly useful for biomass** — you still need a separate mapping from geometry/features to biomass
- ⚠️ **Label issue:** some top leaves were merged into stem labels
- ❌ **No public dataset from this paper**
- ❌ **No code link reported**

This overall judgment comes directly from the paper summary you shared: the work is centered on **3D tomato organ segmentation and phenotype extraction**, not direct biomass prediction. :contentReference[oaicite:0]{index=0}

---

## 1. High-level summary

This paper builds a **3D tomato phenotyping pipeline** using ordinary **RGB video** rather than LiDAR. The general workflow is:

1. capture tomato plants from multiple views
2. reconstruct 3D geometry using **COLMAP + NeRF**
3. convert this into point clouds
4. perform **semantic segmentation** into **stem vs leaf**
5. do **leaf instance segmentation** with an improved **DBSCAN**
6. extract phenotypic traits such as:
   - plant height
   - stem thickness
   - leaf inclination
   - leaf length
   - leaf width
   - leaf area

The main deep learning model is **TomatoSegNet**, which is an improved **PointNet++** with:
- **SCA**: Single Channel Attention
- **GFA**: Global Feature Aggregation

So this is best understood as a **tomato organ segmentation + phenotyping paper**, not a biomass paper. :contentReference[oaicite:1]{index=1}

---

## 2. What this paper is strong at

### ✅ A. Very strong for tomato organ segmentation

This is the biggest value of the paper for your project.

Why it matters:
- it works on **tomato specifically**
- tomato has messy branching, leaf overlap, and occlusion
- your project also needs **tomato organ classification**

The reported segmentation performance is very strong:
- **mIoU = 96.84%**
- **mF1 = 97.97%**
- **mP = 97.82%**
- **mR = 98.62%**
- **OA = 94.22%**

That means the model is highly effective at separating **stem** and **leaf** in 3D point clouds. For your agrifood work, this directly supports the first stage:
**image/video → organ classification**. :contentReference[oaicite:2]{index=2}

### ✅ B. Good end-to-end practical pipeline

A lot of papers only show a model. This one gives you a more complete engineering workflow:
- RGB video capture
- multi-view image extraction
- pose recovery with **COLMAP**
- 3D reconstruction with **NeRF**
- point cloud preprocessing
- manual annotation
- semantic segmentation
- leaf clustering
- trait extraction

That makes it useful not just as a “nice result paper,” but as a **pipeline reference** for how you might structure your own system. :contentReference[oaicite:3]{index=3}

### ✅ C. Strong for organ-level geometric traits

The paper goes beyond classifying points into stem and leaf. It also extracts measurable traits like:
- leaf area
- stem thickness
- plant height
- leaf dimensions
- leaf angle

That is important because biomass estimation usually needs **quantitative organ features**, not only labels.

So even though this paper does not estimate biomass, it gives you a very relevant intermediate step:

**segmented organs → geometric traits → later biomass model**

That is exactly the kind of bridge your project may need. :contentReference[oaicite:4]{index=4}

### ✅ D. Useful treatment of overlapping leaves

They use an improved **DBSCAN** for leaf instance segmentation after semantic segmentation.

That matters because overlapping leaves are one of the hardest parts of plant analysis. If you later want:
- per-leaf analysis
- leaf count
- leaf-level biomass proxies

then this part of the paper is especially helpful.

Reported leaf instance segmentation accuracy:
- **96.03%**

So this is not only good for broad stem/leaf segmentation, but also for more detailed leaf separation. :contentReference[oaicite:5]{index=5}

---

## 3. What this paper does **not** do

### ❌ A. No direct biomass estimation

This is the main limitation for your project.

The paper extracts geometry-related traits, but it does **not** report:
- fresh weight
- dry weight
- leaf biomass
- stem biomass
- organ mass
- regression from image or point cloud features to biomass

So this is **not** a biomass ground-truth paper.

That means you cannot use it as a direct answer to:
> “Can we estimate biomass from tomato images?”

Not by itself.

At best, it gives you the **upstream inputs** that a biomass model could use later. :contentReference[oaicite:6]{index=6}

### ❌ B. No fruit segmentation

The semantic classes are basically:
- **stem**
- **leaf**

That means it does not fully match a broader tomato organ framework where you may eventually want:
- leaf
- stem
- fruit
- root

So it is strongest for **vegetative organ analysis**, not full whole-plant organ biomass accounting. :contentReference[oaicite:7]{index=7}

### ❌ C. No public dataset availability

This is a practical downside.

The paper says the data used is **confidential**, so their own tomato dataset is **not publicly available**.

That means you likely cannot:
- directly download their data
- reproduce their exact benchmark
- train on their dataset without access from authors

So method-wise it is useful, but resource-wise it is limited. :contentReference[oaicite:8]{index=8}

### ❌ D. No code link reported

From the material you shared, there is no public code repository listed.

So again, this is more useful as:
- a **method reference**
than as
- a plug-and-play implementation source. :contentReference[oaicite:9]{index=9}

---

## 4. Methods, equipment, and implementation details

## 4.1 Equipment / acquisition setup

The paper used:
- **Plant:** tomato
- **Varieties:** Busan 88, Yusui 8850, Huangda 888, Zhang Gongqian
- **Location:** Tomato Industry Research Institute of Shanxi Agricultural University
- **Sensor:** RGB camera
- **Camera model:** **Canon EOS70D**
- **Capture mode:** 360° video around the plant
- **Angles:** about **30° from top** and **70° from bottom**
- **Distance:** about **30–40 cm**
- **Video duration:** about **100 s per 10 tomato plants**
- **Frame extraction:** **250 multi-view images**
- **Image resolution:** **1920 × 1080**
- **Overlap:** >80%, average about 82%
- **Collection design:** 80 plants, sampled every 5 days, over 1 month, 6 collections total

This is actually pretty nice for your project because it shows a **relatively low-cost imaging setup**, not an extremely specialized scanner. :contentReference[oaicite:10]{index=10}

## 4.2 Reconstruction / preprocessing software

They used:
- **COLMAP** for structure-from-motion / camera pose estimation
- **NeRF** for scene reconstruction
- **Marching Cubes** for extracting geometry / point cloud
- **CloudCompare** for annotation

Preprocessing included:
- uniform downsampling
- color filtering
- radius filtering
- Euclidean clustering

So the system is heavily based on **3D point cloud phenotyping**, not plain 2D image segmentation. :contentReference[oaicite:11]{index=11}

## 4.3 Dataset and labels

They report:
- **480 original point clouds**
- about **6000 individual tomato point clouds** after preprocessing
- annotation files in **.txt**
- semantic labels mainly **stem** and **leaf**

Important caveat:
- some **top leaves** were difficult to measure and were temporarily labeled as **stem**

For biomass estimation, this matters a lot. Why?

Because if leaf tissue is mislabeled as stem, then:
- leaf geometry estimates may be biased
- stem-related features may be inflated
- any downstream biomass mapping could inherit those errors

So this is a real limitation if you want high-quality organ-specific biomass estimation later. :contentReference[oaicite:12]{index=12}

## 4.4 Deep learning / software / hardware

### Model
- **PointNet++** backbone
- improved into **TomatoSegNet**

### Added modules
- **SCA**
- **GFA**

### Training
- **AdamW**
- **label-smoothed cross-entropy**
- **100 epochs**
- **batch size = 8**
- input point cloud size = **4096 points**
- learning rate:
  - 0.01 for first 50 epochs
  - 0.001 for last 50 epochs

### Baselines
- PointNet
- DGCNN
- PointNeXt
- PointNet++

### Hardware / software
- **GPU:** NVIDIA GeForce RTX 4080
- **OS:** Windows 11
- **CUDA:** 11.6
- **PyTorch:** 1.12.1
- **Python:** 3.9

This section is useful for your literature table because it tells you exactly what stack they used. :contentReference[oaicite:13]{index=13}

---

## 5. Main results

### Semantic segmentation
Reported average results:
- **Precision:** 97.82%
- **Recall:** 98.62%
- **F1:** 97.97%
- **IoU:** 96.84%
- **OA:** 94.22%

Compared with plain PointNet++, TomatoSegNet improved:
- mIoU by 4.04%
- mP by 3.43%
- mR by 3.42%
- mF1 by 2.64%
- OA by 1.63%

This suggests the added attention/feature aggregation modules were genuinely helpful. :contentReference[oaicite:14]{index=14}

### Leaf instance segmentation
Improved DBSCAN achieved:
- **96.03%** clustering accuracy

This supports the claim that their method handles overlapping leaves better than simpler clustering approaches. :contentReference[oaicite:15]{index=15}

### Phenotypic parameter extraction
Reported agreement with manual measurements:
- plant height: **R² = 0.983**
- stem thickness: **R² = 0.903**
- leaf inclination: **R² = 0.916**
- leaf length: **R² = 0.962**
- leaf width: **R² = 0.951**
- leaf area: **R² = 0.978**

So their extracted geometric traits appear quite reliable. That is important because these traits could later serve as **candidate biomass predictors**. :contentReference[oaicite:16]{index=16}

---

## 6. Weaknesses and limitations

### ⚠️ Biomass gap
This is the biggest weakness relative to your project.

The paper stops at geometry/phenotype extraction. It does not do:
- biomass regression
- fresh/dry mass prediction
- destructive validation against organ weights

So for your project, this paper solves:
- **organ classification**
- **geometric measurement**

But not:
- **organ biomass estimation**

### ⚠️ Label simplification
Top leaves partly labeled as stem is a real issue for organ purity.

### ⚠️ Limited organ taxonomy
Only stem and leaf, no fruit or root.

### ⚠️ Reproducibility issue
Confidential data and no code release make it hard to directly reproduce.

### ⚠️ Controlled environment
The data come from a greenhouse-type setting, so performance may drop in noisier real-world conditions. :contentReference[oaicite:17]{index=17}

---

## 7. Dataset and code links

### Dataset from this paper
- **Not publicly available**
- paper states the dataset is **confidential** :contentReference[oaicite:18]{index=18}

### Code from this paper
- **No public code link reported** :contentReference[oaicite:19]{index=19}

### External datasets mentioned by the paper
- **Pheno4D**
- **ROSE-X**

These are mentioned as related public resources, but they are **not this paper’s released dataset**. :contentReference[oaicite:20]{index=20}

---

## 8. Relation to your agrifood project

Your target is:

> **classify different organs of tomato plants, then estimate biomass based on images**

This paper matches that goal **partially but importantly**.

### What it helps with directly
It is very useful for:
- tomato organ segmentation
- stem vs leaf classification
- 3D reconstruction from RGB imagery
- organ-level geometric feature extraction
- leaf instance separation

So for the front half of your pipeline, it is a **strong reference paper**.

### What it does not solve
It does not provide:
- biomass labels
- biomass equations
- mass prediction model
- organ dry/fresh weight mapping

So for the second half of your pipeline, you still need another stage, such as:

1. capture tomato images/video  
2. reconstruct 3D point clouds  
3. segment organs  
4. extract geometric traits  
5. collect destructive biomass ground truth  
6. train a biomass model from organ-level features  

Example idea:
- leaf biomass = f(leaf area, curvature, thickness proxy, stage)
- stem biomass = f(stem length, diameter, volume proxy)

So this paper is **excellent for organ classification**, but only **supporting evidence** for biomass estimation. :contentReference[oaicite:21]{index=21}

---

## 9. Final assessment

### Best one-line takeaway
This is a **very good tomato organ segmentation and phenotyping paper**, but **not a direct biomass paper**. It is highly useful for the **segmentation/feature-extraction stage** of your agrifood pipeline, but you still need a **separate biomass-mapping model and ground-truth biomass data**. :contentReference[oaicite:22]{index=22}

### Super short version
- ✅ strong for tomato stem/leaf segmentation
- ✅ strong for organ-level geometric trait extraction
- ✅ relevant to your project
- ❌ no biomass labels
- ❌ no direct biomass prediction
- ❌ no public dataset
- ❌ no code release

---

## 10. Suggested note for your own literature table

**Relevance to project:** High for organ segmentation, medium-low for biomass directly  
**Use in your project:** segmentation backbone / phenotyping reference  
**Biomass usefulness:** indirect only  
**Dataset availability:** no  
**Code availability:** no  
**Main value:** tomato-specific 3D organ segmentation using low-cost RGB-based reconstruction :contentReference[oaicite:23]{index=23}