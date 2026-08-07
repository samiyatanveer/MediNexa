"""
data-generator/generate_data.py
Generates ~1,200 synthetic hospital records across 4 categories:
  - 600 patients
  - 250 medicines
  - 175 instruments
  - 175 inventory items
All IDs are SHA-256 masked. No real PII is stored.
Seed is fixed for reproducibility.
"""

import json
import random
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from pii_mask import PIIMasker

SEED = 42
random.seed(SEED)

OUTPUT_DIR = Path(__file__).parent.parent / "data"
OUTPUT_DIR.mkdir(exist_ok=True)

masker = PIIMasker()

# ─── Lookup tables ────────────────────────────────────────────────────────────

DIAGNOSES = [
    "Hypertension", "Type 2 Diabetes", "Coronary Artery Disease",
    "COPD", "Asthma", "Community-Acquired Pneumonia", "Urinary Tract Infection",
    "Gastroenteritis", "Migraine", "Anxiety Disorder", "Major Depression",
    "Hypothyroidism", "Hyperthyroidism", "Chronic Kidney Disease",
    "Heart Failure", "Atrial Fibrillation", "Stroke", "Osteoarthritis",
    "Rheumatoid Arthritis", "Anemia", "Appendicitis", "Cholecystitis",
    "Pancreatitis", "Sepsis", "Cellulitis", "Peripheral Vascular Disease",
    "Deep Vein Thrombosis", "Pulmonary Embolism", "Gout", "Epilepsy",
    "Parkinson Disease", "Alzheimer Disease", "Schizophrenia", "Bipolar Disorder",
    "Eczema", "Psoriasis", "Type 1 Diabetes", "Hepatitis B", "Hepatitis C",
    "HIV Infection", "Tuberculosis", "Malaria", "Dengue Fever", "COVID-19",
    "Influenza", "Pneumothorax", "Pleural Effusion", "Aortic Stenosis",
    "Mitral Regurgitation", "Obesity",
]

SYMPTOMS = [
    "chest pain", "shortness of breath", "fatigue", "dizziness", "nausea",
    "vomiting", "abdominal pain", "headache", "fever", "cough",
    "palpitations", "edema", "weight loss", "weight gain", "polyuria",
    "polydipsia", "jaundice", "haematuria", "dysuria", "rash",
    "joint pain", "back pain", "neck pain", "muscle weakness", "tremor",
    "confusion", "syncope", "dysphagia", "constipation", "diarrhea",
    "insomnia", "anxiety", "depression", "wheezing", "haemoptysis",
    "epistaxis", "palpitations", "blurred vision", "tinnitus", "pruritus",
]

BLOOD_TYPES = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]
GENDERS = ["Male", "Female"]

VISIT_REASONS = [
    "Routine check-up", "Follow-up consultation", "Emergency admission",
    "Post-operative review", "Medication review", "Specialist referral",
    "Annual physical", "Acute illness", "Chronic disease management",
    "Diagnostic workup",
]

DEPARTMENTS = [
    "Cardiology", "Pulmonology", "Endocrinology", "Nephrology", "Neurology",
    "Oncology", "Gastroenterology", "Orthopedics", "Psychiatry", "Dermatology",
    "Emergency Medicine", "Intensive Care Unit", "General Surgery",
    "Infectious Disease", "Rheumatology", "Hematology", "Urology",
]

LOCATIONS = [
    "ICU", "ER", "OR-1", "OR-2", "Ward-A", "Ward-B", "Ward-C",
    "Radiology", "Laboratory", "Pharmacy", "NICU", "CCU",
    "Outpatient Clinic", "Physiotherapy", "Endoscopy Suite",
]

# ─── Medicine data ─────────────────────────────────────────────────────────────

MEDICINES = [
    # Cardiovascular
    {"name": "Lisinopril",      "dosages": ["5mg","10mg","20mg","40mg"],   "form": "Tablet",   "indications": ["Hypertension","Heart Failure","Chronic Kidney Disease"], "contraindications": ["Pregnancy","Angioedema history","Hyperkalemia"], "synonyms": ["ACE inhibitor","antihypertensive","lisinopril"]},
    {"name": "Amlodipine",      "dosages": ["2.5mg","5mg","10mg"],         "form": "Tablet",   "indications": ["Hypertension","Angina"], "contraindications": ["Severe aortic stenosis","Cardiogenic shock"], "synonyms": ["calcium channel blocker","CCB","norvasc"]},
    {"name": "Metoprolol",      "dosages": ["25mg","50mg","100mg"],        "form": "Tablet",   "indications": ["Hypertension","Heart Failure","Atrial Fibrillation"], "contraindications": ["Severe bradycardia","Heart block","Asthma"], "synonyms": ["beta blocker","lopressor","metoprolol succinate"]},
    {"name": "Atorvastatin",    "dosages": ["10mg","20mg","40mg","80mg"],  "form": "Tablet",   "indications": ["High Cholesterol","Coronary Artery Disease"], "contraindications": ["Active liver disease","Pregnancy"], "synonyms": ["statin","lipitor","HMG-CoA reductase inhibitor"]},
    {"name": "Warfarin",        "dosages": ["1mg","2mg","5mg"],            "form": "Tablet",   "indications": ["Atrial Fibrillation","Deep Vein Thrombosis","Pulmonary Embolism"], "contraindications": ["Active bleeding","Pregnancy"], "synonyms": ["anticoagulant","blood thinner","coumadin"]},
    {"name": "Aspirin",         "dosages": ["75mg","100mg","325mg"],       "form": "Tablet",   "indications": ["Coronary Artery Disease","Stroke prevention","Atrial Fibrillation"], "contraindications": ["Active peptic ulcer","Allergy"], "synonyms": ["ASA","acetylsalicylic acid","antiplatelet"]},
    {"name": "Furosemide",      "dosages": ["20mg","40mg","80mg"],         "form": "Tablet",   "indications": ["Heart Failure","Edema","Hypertension"], "contraindications": ["Anuria","Severe electrolyte depletion"], "synonyms": ["loop diuretic","lasix","water pill"]},
    {"name": "Spironolactone",  "dosages": ["25mg","50mg","100mg"],        "form": "Tablet",   "indications": ["Heart Failure","Hypertension","Hyperaldosteronism"], "contraindications": ["Hyperkalemia","Anuria"], "synonyms": ["aldosterone antagonist","potassium-sparing diuretic"]},
    # Diabetes
    {"name": "Metformin",       "dosages": ["500mg","850mg","1000mg"],     "form": "Tablet",   "indications": ["Type 2 Diabetes","Prediabetes"], "contraindications": ["Chronic Kidney Disease stage 4+","Liver failure","Contrast dye use"], "synonyms": ["biguanide","glucophage","antidiabetic"]},
    {"name": "Glibenclamide",   "dosages": ["2.5mg","5mg"],                "form": "Tablet",   "indications": ["Type 2 Diabetes"], "contraindications": ["Type 1 Diabetes","Renal failure","Sulfonamide allergy"], "synonyms": ["sulfonylurea","glyburide","antidiabetic"]},
    {"name": "Insulin Glargine","dosages": ["10 units","20 units","40 units"], "form": "Injectable","indications": ["Type 1 Diabetes","Type 2 Diabetes"], "contraindications": ["Hypoglycemia"], "synonyms": ["basal insulin","lantus","long-acting insulin"]},
    {"name": "Sitagliptin",     "dosages": ["50mg","100mg"],               "form": "Tablet",   "indications": ["Type 2 Diabetes"], "contraindications": ["Type 1 Diabetes","Pancreatitis history"], "synonyms": ["DPP-4 inhibitor","januvia","gliptin"]},
    # Respiratory
    {"name": "Salbutamol",      "dosages": ["2mg","4mg","100mcg/puff"],    "form": "Inhaler",  "indications": ["Asthma","COPD","Bronchospasm"], "contraindications": ["Cardiac arrhythmia","Severe hyperthyroidism"], "synonyms": ["albuterol","SABA","bronchodilator","ventolin"]},
    {"name": "Budesonide",      "dosages": ["100mcg","200mcg","400mcg"],   "form": "Inhaler",  "indications": ["Asthma","COPD"], "contraindications": ["Untreated fungal infection","Hypersensitivity"], "synonyms": ["corticosteroid","ICS","inhaled steroid","pulmicort"]},
    {"name": "Tiotropium",      "dosages": ["18mcg"],                      "form": "Inhaler",  "indications": ["COPD"], "contraindications": ["Narrow-angle glaucoma","Urinary retention"], "synonyms": ["LAMA","anticholinergic","spiriva","long-acting muscarinic antagonist"]},
    {"name": "Montelukast",     "dosages": ["4mg","5mg","10mg"],           "form": "Tablet",   "indications": ["Asthma","Allergic Rhinitis"], "contraindications": ["Hypersensitivity"], "synonyms": ["leukotriene antagonist","singulair","LTRA"]},
    # Antibiotics
    {"name": "Amoxicillin",     "dosages": ["250mg","500mg","875mg"],      "form": "Capsule",  "indications": ["Community-Acquired Pneumonia","Urinary Tract Infection","Strep Throat"], "contraindications": ["Penicillin allergy"], "synonyms": ["penicillin","antibiotic","amoxil","beta-lactam"]},
    {"name": "Ciprofloxacin",   "dosages": ["250mg","500mg","750mg"],      "form": "Tablet",   "indications": ["Urinary Tract Infection","Respiratory Infection","Gastroenteritis"], "contraindications": ["Pregnancy","Tendon disorders","QT prolongation"], "synonyms": ["fluoroquinolone","antibiotic","cipro"]},
    {"name": "Azithromycin",    "dosages": ["250mg","500mg"],              "form": "Tablet",   "indications": ["Community-Acquired Pneumonia","Atypical Pneumonia","Sexually Transmitted Infections"], "contraindications": ["QT prolongation","Liver disease"], "synonyms": ["macrolide","antibiotic","zithromax","Z-pack"]},
    {"name": "Metronidazole",   "dosages": ["200mg","400mg","500mg"],      "form": "Tablet",   "indications": ["Anaerobic Infections","Clostridium difficile","Trichomoniasis"], "contraindications": ["First trimester pregnancy","Alcohol use"], "synonyms": ["nitroimidazole","antibiotic","flagyl"]},
    {"name": "Doxycycline",     "dosages": ["50mg","100mg","200mg"],       "form": "Capsule",  "indications": ["Community-Acquired Pneumonia","Malaria","Lyme Disease"], "contraindications": ["Pregnancy","Children under 8","Severe renal failure"], "synonyms": ["tetracycline","antibiotic","doxy","vibramycin"]},
    {"name": "Ceftriaxone",     "dosages": ["500mg","1g","2g"],            "form": "Injectable","indications": ["Sepsis","Meningitis","Community-Acquired Pneumonia"], "contraindications": ["Cephalosporin allergy","Neonatal jaundice"], "synonyms": ["cephalosporin","antibiotic","rocephin","third-generation"]},
    # Neurological/Psychiatric
    {"name": "Amlodipine",      "dosages": ["5mg","10mg"],                 "form": "Tablet",   "indications": ["Migraine prevention","Hypertension"], "contraindications": ["Severe hypotension"], "synonyms": ["calcium channel blocker","migraine prophylaxis"]},
    {"name": "Sertraline",      "dosages": ["25mg","50mg","100mg"],        "form": "Tablet",   "indications": ["Major Depression","Anxiety Disorder","OCD"], "contraindications": ["MAO inhibitor use","Pimozide use"], "synonyms": ["SSRI","antidepressant","zoloft","serotonin"]},
    {"name": "Fluoxetine",      "dosages": ["10mg","20mg","40mg"],         "form": "Capsule",  "indications": ["Major Depression","Bipolar Disorder","Anxiety Disorder"], "contraindications": ["MAO inhibitor use","QT prolongation"], "synonyms": ["SSRI","antidepressant","prozac","serotonin"]},
    {"name": "Haloperidol",     "dosages": ["0.5mg","1mg","2mg","5mg"],    "form": "Tablet",   "indications": ["Schizophrenia","Acute Psychosis","Delirium"], "contraindications": ["Parkinson Disease","QT prolongation","Coma"], "synonyms": ["antipsychotic","typical antipsychotic","haldol","neuroleptic"]},
    {"name": "Valproate",       "dosages": ["200mg","500mg"],              "form": "Tablet",   "indications": ["Epilepsy","Bipolar Disorder","Migraine prevention"], "contraindications": ["Pregnancy","Liver disease","Urea cycle disorder"], "synonyms": ["anticonvulsant","mood stabilizer","depakote","valproic acid"]},
    {"name": "Levetiracetam",   "dosages": ["250mg","500mg","1000mg"],     "form": "Tablet",   "indications": ["Epilepsy"], "contraindications": ["Hypersensitivity","Severe renal failure"], "synonyms": ["anticonvulsant","keppra","antiepileptic"]},
    # GI
    {"name": "Omeprazole",      "dosages": ["10mg","20mg","40mg"],         "form": "Capsule",  "indications": ["GERD","Peptic Ulcer","H. pylori"], "contraindications": ["Clopidogrel use","Hypersensitivity"], "synonyms": ["PPI","proton pump inhibitor","prilosec","acid reducer"]},
    {"name": "Pantoprazole",    "dosages": ["20mg","40mg"],                "form": "Tablet",   "indications": ["GERD","Peptic Ulcer","Zollinger-Ellison syndrome"], "contraindications": ["Rilpivirine use"], "synonyms": ["PPI","proton pump inhibitor","protonix","acid reducer"]},
    {"name": "Ondansetron",     "dosages": ["4mg","8mg"],                  "form": "Tablet",   "indications": ["Nausea","Vomiting","Chemotherapy-induced nausea"], "contraindications": ["QT prolongation","Congenital long QT syndrome"], "synonyms": ["antiemetic","5-HT3 antagonist","zofran","anti-nausea"]},
    # Pain/Rheum
    {"name": "Ibuprofen",       "dosages": ["200mg","400mg","600mg"],      "form": "Tablet",   "indications": ["Pain","Fever","Osteoarthritis","Gout"], "contraindications": ["Active peptic ulcer","Renal failure","Third trimester pregnancy"], "synonyms": ["NSAID","anti-inflammatory","advil","pain relief"]},
    {"name": "Paracetamol",     "dosages": ["325mg","500mg","1000mg"],     "form": "Tablet",   "indications": ["Pain","Fever","Headache"], "contraindications": ["Severe liver disease"], "synonyms": ["acetaminophen","tylenol","analgesic","fever reducer"]},
    {"name": "Morphine",        "dosages": ["5mg","10mg","15mg"],          "form": "Injectable","indications": ["Severe Pain","Myocardial Infarction","Palliative Care"], "contraindications": ["Respiratory depression","Paralytic ileus","Opioid allergy"], "synonyms": ["opioid","narcotic","strong analgesic","opiate"]},
    {"name": "Tramadol",        "dosages": ["50mg","100mg"],               "form": "Tablet",   "indications": ["Moderate Pain","Osteoarthritis"], "contraindications": ["Seizure disorder","MAO inhibitor use","Opioid allergy"], "synonyms": ["opioid analgesic","tramacet","weak opioid"]},
    {"name": "Colchicine",      "dosages": ["0.5mg","1mg"],                "form": "Tablet",   "indications": ["Gout","Familial Mediterranean Fever"], "contraindications": ["Severe renal failure","Severe hepatic failure"], "synonyms": ["antigout","uricosuric","gout treatment"]},
    {"name": "Allopurinol",     "dosages": ["100mg","200mg","300mg"],      "form": "Tablet",   "indications": ["Gout","Hyperuricemia","Kidney Stones"], "contraindications": ["Acute gout attack","Azathioprine use"], "synonyms": ["xanthine oxidase inhibitor","urate lowering","zyloprim"]},
    {"name": "Methotrexate",    "dosages": ["2.5mg","7.5mg","15mg"],       "form": "Tablet",   "indications": ["Rheumatoid Arthritis","Psoriasis","Cancer"], "contraindications": ["Pregnancy","Severe liver disease","Immunodeficiency"], "synonyms": ["DMARD","disease modifying","antimetabolite"]},
    # Endocrine
    {"name": "Levothyroxine",   "dosages": ["25mcg","50mcg","100mcg"],     "form": "Tablet",   "indications": ["Hypothyroidism"], "contraindications": ["Untreated adrenal insufficiency","Thyrotoxicosis"], "synonyms": ["thyroid hormone","synthroid","T4","thyroid replacement"]},
    {"name": "Prednisolone",    "dosages": ["5mg","10mg","20mg","40mg"],   "form": "Tablet",   "indications": ["Asthma","Rheumatoid Arthritis","Allergic reactions","COPD exacerbation"], "contraindications": ["Systemic fungal infection","Live vaccines"], "synonyms": ["corticosteroid","steroid","anti-inflammatory","prednisolone"]},
    # Anticoagulants
    {"name": "Heparin",         "dosages": ["5000 units","10000 units"],   "form": "Injectable","indications": ["Deep Vein Thrombosis","Pulmonary Embolism","Atrial Fibrillation"], "contraindications": ["Active bleeding","HIT","Severe thrombocytopenia"], "synonyms": ["anticoagulant","blood thinner","unfractionated heparin","UFH"]},
    {"name": "Enoxaparin",      "dosages": ["20mg","40mg","60mg","80mg"],  "form": "Injectable","indications": ["Deep Vein Thrombosis","Pulmonary Embolism","ACS"], "contraindications": ["Active bleeding","HIT","Prosthetic heart valves"], "synonyms": ["LMWH","low molecular weight heparin","lovenox","anticoagulant"]},
    # Renal/Urology
    {"name": "Tamsulosin",      "dosages": ["0.4mg"],                      "form": "Capsule",  "indications": ["Benign Prostatic Hyperplasia","Urinary Retention"], "contraindications": ["Severe hepatic impairment","Concurrent PDE5 inhibitor"], "synonyms": ["alpha blocker","flomax","BPH treatment"]},
    # Misc
    {"name": "Ranitidine",      "dosages": ["75mg","150mg","300mg"],       "form": "Tablet",   "indications": ["GERD","Peptic Ulcer"], "contraindications": ["Hypersensitivity"], "synonyms": ["H2 blocker","histamine antagonist","zantac","acid reducer"]},
    {"name": "Cetirizine",      "dosages": ["5mg","10mg"],                 "form": "Tablet",   "indications": ["Allergic Rhinitis","Urticaria","Eczema"], "contraindications": ["Severe renal failure"], "synonyms": ["antihistamine","zyrtec","allergy relief","H1 blocker"]},
    {"name": "Loratadine",      "dosages": ["5mg","10mg"],                 "form": "Tablet",   "indications": ["Allergic Rhinitis","Urticaria"], "contraindications": ["Hypersensitivity"], "synonyms": ["antihistamine","claritin","non-drowsy antihistamine","allergy"]},
    {"name": "Vitamin D3",      "dosages": ["400 IU","800 IU","2000 IU"],  "form": "Capsule",  "indications": ["Vitamin D deficiency","Osteoporosis prevention","Chronic Kidney Disease"], "contraindications": ["Hypercalcemia","Vitamin D toxicity"], "synonyms": ["cholecalciferol","vitamin D supplement","calcium metabolism"]},
    {"name": "Ferrous Sulfate", "dosages": ["200mg","325mg"],              "form": "Tablet",   "indications": ["Iron Deficiency Anemia"], "contraindications": ["Haemochromatosis","Repeated blood transfusion"], "synonyms": ["iron supplement","iron tablet","anemia treatment"]},
    {"name": "Folic Acid",      "dosages": ["400mcg","1mg","5mg"],         "form": "Tablet",   "indications": ["Anemia","Pregnancy","Methotrexate use"], "contraindications": ["Undiagnosed anemia"], "synonyms": ["folate","B9","neural tube defect prevention"]},
]

# ─── Instrument data ──────────────────────────────────────────────────────────

INSTRUMENTS = [
    # Diagnostic imaging
    {"name": "CT Scanner",              "category": "Diagnostic Imaging",  "departments": ["Radiology","Emergency Medicine","Oncology"],  "synonyms": ["computed tomography","CT","CAT scan","cross-sectional imaging"]},
    {"name": "MRI Machine",             "category": "Diagnostic Imaging",  "departments": ["Radiology","Neurology","Orthopedics"],        "synonyms": ["magnetic resonance imaging","MRI","NMR","magnetic scanner"]},
    {"name": "X-Ray Machine",           "category": "Diagnostic Imaging",  "departments": ["Radiology","Emergency Medicine","Orthopedics"],"synonyms": ["radiograph","X-ray","plain film","roentgenography"]},
    {"name": "Ultrasound Machine",      "category": "Diagnostic Imaging",  "departments": ["Radiology","Cardiology","Obstetrics"],        "synonyms": ["ultrasound","sonography","echo","diagnostic ultrasound"]},
    {"name": "Fluoroscopy Unit",        "category": "Diagnostic Imaging",  "departments": ["Radiology","Gastroenterology"],               "synonyms": ["fluoroscope","real-time X-ray","contrast imaging"]},
    {"name": "PET Scanner",             "category": "Diagnostic Imaging",  "departments": ["Radiology","Oncology","Neurology"],           "synonyms": ["positron emission tomography","PET","nuclear medicine imaging"]},
    {"name": "Mammography Machine",     "category": "Diagnostic Imaging",  "departments": ["Radiology"],                                  "synonyms": ["mammogram","breast imaging","mammograph"]},
    # Cardiac monitoring
    {"name": "ECG Monitor",             "category": "Cardiac Monitoring",  "departments": ["Cardiology","ICU","Emergency Medicine"],      "synonyms": ["electrocardiogram","EKG","ECG","heart monitor","12-lead ECG"]},
    {"name": "Holter Monitor",          "category": "Cardiac Monitoring",  "departments": ["Cardiology"],                                 "synonyms": ["ambulatory ECG","24-hour ECG","continuous heart monitor"]},
    {"name": "Echocardiography Unit",   "category": "Cardiac Monitoring",  "departments": ["Cardiology"],                                 "synonyms": ["echo","cardiac ultrasound","transthoracic echocardiogram","TTE"]},
    {"name": "Defibrillator",           "category": "Resuscitation",       "departments": ["ICU","ER","Cardiology","General Surgery"],    "synonyms": ["AED","shock device","cardioverter","crash cart device"]},
    {"name": "Cardiac Catheter Lab",    "category": "Cardiac Monitoring",  "departments": ["Cardiology"],                                 "synonyms": ["cath lab","angiography unit","coronary angiography","PCI lab"]},
    # Respiratory
    {"name": "Mechanical Ventilator",   "category": "Respiratory Support", "departments": ["ICU","Emergency Medicine","Anesthesia"],      "synonyms": ["ventilator","breathing machine","mechanical ventilation","ICU ventilator"]},
    {"name": "Pulse Oximeter",          "category": "Monitoring",          "departments": ["ICU","ER","Ward-A","Ward-B","Anesthesia"],    "synonyms": ["SpO2 monitor","oxygen saturation","pulse ox","sat probe"]},
    {"name": "Spirometer",              "category": "Respiratory Diagnostics","departments": ["Pulmonology","Respiratory Therapy"],       "synonyms": ["lung function test","PFT device","spirometry","FEV1 measurement"]},
    {"name": "BiPAP Machine",           "category": "Respiratory Support", "departments": ["ICU","Pulmonology","Emergency Medicine"],     "synonyms": ["BiPAP","bilevel positive airway pressure","non-invasive ventilation","NIV"]},
    {"name": "CPAP Machine",            "category": "Respiratory Support", "departments": ["Pulmonology","ICU"],                          "synonyms": ["CPAP","continuous positive airway pressure","sleep apnea device"]},
    # Laboratory
    {"name": "Hematology Analyzer",     "category": "Laboratory",          "departments": ["Laboratory"],                                 "synonyms": ["CBC analyzer","blood count machine","FBC analyzer","complete blood count"]},
    {"name": "Chemistry Analyzer",      "category": "Laboratory",          "departments": ["Laboratory"],                                 "synonyms": ["biochemistry analyzer","metabolic panel","LFT analyzer","kidney function"]},
    {"name": "Blood Culture Analyzer",  "category": "Laboratory",          "departments": ["Laboratory","Infectious Disease"],            "synonyms": ["BACTEC","blood culture","bacteremia detection","microbiology analyzer"]},
    {"name": "Microscope",              "category": "Laboratory",          "departments": ["Laboratory","Pathology"],                     "synonyms": ["light microscope","optical microscope","compound microscope","lab scope"]},
    {"name": "Centrifuge",              "category": "Laboratory",          "departments": ["Laboratory"],                                 "synonyms": ["lab centrifuge","sample separator","cell separator"]},
    {"name": "PCR Machine",             "category": "Laboratory",          "departments": ["Laboratory","Infectious Disease"],            "synonyms": ["polymerase chain reaction","PCR","thermocycler","DNA amplifier","COVID test machine"]},
    {"name": "Glucose Meter",           "category": "Point-of-Care",       "departments": ["Ward-A","Ward-B","ICU","ER"],                 "synonyms": ["glucometer","blood sugar monitor","capillary glucose","bedside glucose"]},
    # Surgical
    {"name": "Electrosurgical Unit",    "category": "Surgical Equipment",  "departments": ["General Surgery","OR-1","OR-2"],              "synonyms": ["diathermy","bovie","ESU","electrocautery","surgical diathermy"]},
    {"name": "Surgical Table",          "category": "Surgical Equipment",  "departments": ["OR-1","OR-2","General Surgery"],              "synonyms": ["operating table","OR table","surgical bed"]},
    {"name": "Anesthesia Machine",      "category": "Anesthesia",          "departments": ["OR-1","OR-2","ICU","Anesthesia"],             "synonyms": ["anesthesia workstation","GA machine","gas machine","anaesthetic machine"]},
    {"name": "Laparoscope",             "category": "Surgical Equipment",  "departments": ["General Surgery","Gynecology","Urology"],     "synonyms": ["laparoscopy","minimally invasive surgery","MIS scope","keyhole surgery"]},
    {"name": "Endoscope",               "category": "Diagnostic",          "departments": ["Gastroenterology","Pulmonology"],             "synonyms": ["GI scope","gastroscope","colonoscope","flexible endoscope"]},
    # Infusion / IV
    {"name": "Infusion Pump",           "category": "Medication Delivery", "departments": ["ICU","Ward-A","Ward-B","Oncology"],           "synonyms": ["IV pump","syringe driver","drug infusion","volumetric pump"]},
    {"name": "Syringe Pump",            "category": "Medication Delivery", "departments": ["ICU","Anesthesia","Pediatrics"],              "synonyms": ["syringe driver","PCA pump","patient-controlled analgesia","micro-infusion"]},
    # Monitoring
    {"name": "Patient Monitor",         "category": "Monitoring",          "departments": ["ICU","ER","OR-1","OR-2","CCU"],               "synonyms": ["bedside monitor","vital signs monitor","multiparameter monitor","cardiac monitor"]},
    {"name": "Blood Pressure Monitor",  "category": "Monitoring",          "departments": ["Ward-A","Ward-B","ER","Outpatient Clinic"],   "synonyms": ["sphygmomanometer","BP cuff","NIBP","automated BP monitor"]},
    {"name": "Temperature Monitor",     "category": "Monitoring",          "departments": ["Ward-A","Ward-B","ICU","ER"],                 "synonyms": ["thermometer","core temperature","tympanic thermometer","rectal thermometer"]},
    # Specialized
    {"name": "Dialysis Machine",        "category": "Renal Therapy",       "departments": ["Nephrology","ICU"],                           "synonyms": ["hemodialysis","CRRT","renal replacement therapy","kidney machine"]},
    {"name": "Phototherapy Unit",       "category": "Neonatal",            "departments": ["NICU","Pediatrics"],                          "synonyms": ["bilirubin lights","jaundice lamp","neonatal phototherapy"]},
    {"name": "Ophthalmoscope",          "category": "Diagnostic",          "departments": ["Ophthalmology","Neurology"],                  "synonyms": ["fundoscope","retinal exam","eye exam instrument","fundal examination"]},
]

# ─── Inventory items ──────────────────────────────────────────────────────────

INVENTORY_ITEMS = [
    # PPE
    {"name": "Surgical Gloves (Box)",       "category": "PPE",               "unit": "Box",    "locations": ["Pharmacy","Ward-A","Ward-B","ER","OR-1","OR-2"], "synonyms": ["gloves","sterile gloves","latex gloves","nitrile gloves"]},
    {"name": "N95 Respirator Mask",         "category": "PPE",               "unit": "Box",    "locations": ["Pharmacy","Ward-A","ER","ICU"],                  "synonyms": ["N95","respirator","FFP2 mask","particulate mask","PPE mask"]},
    {"name": "Surgical Face Mask",          "category": "PPE",               "unit": "Box",    "locations": ["Pharmacy","Ward-A","Ward-B","ER"],               "synonyms": ["face mask","procedure mask","medical mask","surgical mask","3-ply mask"]},
    {"name": "Isolation Gown",              "category": "PPE",               "unit": "Pack",   "locations": ["Pharmacy","Ward-A","Ward-B","ICU","ER"],         "synonyms": ["gown","protective gown","barrier gown","PPE gown"]},
    {"name": "Face Shield",                 "category": "PPE",               "unit": "Each",   "locations": ["Pharmacy","ER","ICU","OR-1"],                    "synonyms": ["face shield","visor","eye protection","splatter guard"]},
    {"name": "Shoe Covers",                 "category": "PPE",               "unit": "Pack",   "locations": ["OR-1","OR-2","Pharmacy"],                        "synonyms": ["shoe covers","booties","foot covers","OR covers"]},
    # Wound care
    {"name": "Sterile Gauze Pads (Pack)",   "category": "Wound Care",        "unit": "Pack",   "locations": ["Ward-A","Ward-B","ER","OR-1","OR-2","Pharmacy"],"synonyms": ["gauze","sterile gauze","dressing","wound dressing"]},
    {"name": "Adhesive Bandage Strips",     "category": "Wound Care",        "unit": "Box",    "locations": ["Ward-A","ER","Outpatient Clinic","Pharmacy"],    "synonyms": ["bandaid","plaster","sticking plaster","wound cover"]},
    {"name": "Elastic Bandage Roll",        "category": "Wound Care",        "unit": "Roll",   "locations": ["Ward-A","Ward-B","ER","Physiotherapy"],          "synonyms": ["crepe bandage","compression bandage","ACE bandage","elastic wrap"]},
    {"name": "Hydrocolloid Dressing",       "category": "Wound Care",        "unit": "Pack",   "locations": ["Ward-A","Ward-B","Wound Care Clinic"],           "synonyms": ["hydrocolloid","pressure wound dressing","moisture dressing","duoderm"]},
    {"name": "Surgical Suture Kit",         "category": "Wound Care",        "unit": "Kit",    "locations": ["ER","OR-1","OR-2","General Surgery"],            "synonyms": ["sutures","stitches","suture set","wound closure kit"]},
    {"name": "Skin Stapler",                "category": "Wound Care",        "unit": "Each",   "locations": ["OR-1","OR-2","ER"],                             "synonyms": ["surgical stapler","skin closure","stapler","wound staple"]},
    # IV/Infusion
    {"name": "Normal Saline 0.9% 1L Bag",  "category": "IV Fluids",         "unit": "Bag",    "locations": ["Pharmacy","Ward-A","Ward-B","ICU","ER"],         "synonyms": ["normal saline","NS","0.9% NaCl","isotonic saline","IV fluid"]},
    {"name": "Ringer's Lactate 1L Bag",    "category": "IV Fluids",         "unit": "Bag",    "locations": ["Pharmacy","Ward-A","ER","OR-1"],                 "synonyms": ["RL","Ringer's","lactated Ringer's","balanced crystalloid","IV fluid"]},
    {"name": "5% Dextrose 500mL Bag",      "category": "IV Fluids",         "unit": "Bag",    "locations": ["Pharmacy","Ward-A","Ward-B","ICU"],              "synonyms": ["D5W","dextrose","glucose solution","IV glucose","sugar water"]},
    {"name": "IV Cannula 18G",             "category": "IV Access",         "unit": "Each",   "locations": ["Pharmacy","Ward-A","Ward-B","ER","ICU"],         "synonyms": ["IV line","cannula","venflon","peripheral IV","IV catheter"]},
    {"name": "IV Cannula 20G",             "category": "IV Access",         "unit": "Each",   "locations": ["Pharmacy","Ward-A","Ward-B","ER"],               "synonyms": ["IV line","cannula","venflon","peripheral IV","IV catheter"]},
    {"name": "IV Administration Set",      "category": "IV Access",         "unit": "Each",   "locations": ["Pharmacy","Ward-A","Ward-B","ICU","ER"],         "synonyms": ["drip set","IV tubing","giving set","infusion set"]},
    {"name": "Central Venous Catheter Kit","category": "IV Access",         "unit": "Kit",    "locations": ["ICU","OR-1","ER"],                              "synonyms": ["CVC","central line","central venous access","CVP line"]},
    # Respiratory
    {"name": "Oxygen Cylinder (E-size)",   "category": "Respiratory",       "unit": "Cylinder","locations": ["ER","Ward-A","Ward-B","ICU","Ambulance Bay"],  "synonyms": ["O2 cylinder","oxygen tank","portable O2","medical oxygen"]},
    {"name": "Nasal Cannula",              "category": "Respiratory",       "unit": "Each",   "locations": ["Ward-A","Ward-B","ICU","ER","Pharmacy"],         "synonyms": ["nasal prongs","low-flow O2","nasal oxygen","oxygen prongs"]},
    {"name": "Non-Rebreather Mask",        "category": "Respiratory",       "unit": "Each",   "locations": ["ER","ICU","Pharmacy"],                           "synonyms": ["NRM","high-flow mask","oxygen mask","NRBM","reservoir mask"]},
    {"name": "Endotracheal Tube 7.5mm",    "category": "Airway",            "unit": "Each",   "locations": ["ICU","ER","OR-1","OR-2"],                        "synonyms": ["ETT","ET tube","intubation tube","airway tube","endotracheal intubation"]},
    {"name": "Suction Catheter Kit",       "category": "Airway",            "unit": "Kit",    "locations": ["ICU","ER","Ward-A"],                             "synonyms": ["suction catheter","yankauer","airway suction","tracheal suction"]},
    # Lab / Specimen
    {"name": "Blood Collection Tubes (Set)","category": "Laboratory",       "unit": "Pack",   "locations": ["Laboratory","Ward-A","Ward-B","ER"],             "synonyms": ["vacutainer","blood tubes","specimen tubes","EDTA tube","serum tube"]},
    {"name": "Urine Collection Container", "category": "Laboratory",        "unit": "Each",   "locations": ["Laboratory","Ward-A","Ward-B","Outpatient Clinic"],"synonyms": ["urine cup","urine container","specimen cup","midstream urine"]},
    {"name": "Lancets (Box)",              "category": "Point-of-Care",     "unit": "Box",    "locations": ["Ward-A","Ward-B","ER","Outpatient Clinic"],      "synonyms": ["finger lancet","glucometer lancet","finger prick","blood lancet"]},
    {"name": "Rapid COVID-19 Antigen Test","category": "Diagnostics",       "unit": "Kit",    "locations": ["Laboratory","ER","Outpatient Clinic"],           "synonyms": ["COVID test","rapid antigen test","RAT","coronavirus test","antigen kit"]},
    # Nutrition
    {"name": "Enteral Feeding Formula 1L", "category": "Nutrition",         "unit": "Bottle", "locations": ["Pharmacy","ICU","Ward-A"],                       "synonyms": ["tube feed","NG tube feed","enteral nutrition","feeding formula","liquid diet"]},
    {"name": "TPN Bag 2L",                 "category": "Nutrition",         "unit": "Bag",    "locations": ["Pharmacy","ICU"],                               "synonyms": ["TPN","total parenteral nutrition","IV nutrition","parenteral feeding"]},
    # Cardiac consumables
    {"name": "ECG Electrodes (Pack)",      "category": "Cardiac",           "unit": "Pack",   "locations": ["Ward-A","Ward-B","ICU","ER","Cardiology"],       "synonyms": ["ECG leads","cardiac electrodes","EKG pads","monitoring pads"]},
    {"name": "Defibrillator Pads",         "category": "Cardiac",           "unit": "Pair",   "locations": ["ER","ICU","Ward-A","Cardiology"],               "synonyms": ["defibrillation pads","AED pads","shock pads","defib electrodes"]},
    {"name": "Blood Pressure Cuff (Adult)","category": "Monitoring",        "unit": "Each",   "locations": ["Ward-A","Ward-B","ER","Outpatient Clinic"],      "synonyms": ["BP cuff","sphygmomanometer cuff","NIBP cuff","blood pressure band"]},
    # Infection control
    {"name": "Alcohol Hand Sanitizer 500mL","category": "Infection Control","unit": "Bottle", "locations": ["Ward-A","Ward-B","ER","ICU","OR-1","OR-2"],      "synonyms": ["hand rub","hand gel","sanitizer","alcohol gel","disinfectant"]},
    {"name": "Chlorhexidine 2% Solution",  "category": "Infection Control", "unit": "Bottle", "locations": ["Ward-A","OR-1","OR-2","ICU"],                   "synonyms": ["chlorhexidine","CHG","antiseptic","skin prep","surgical scrub"]},
    {"name": "Sharps Container 5L",        "category": "Waste Management",  "unit": "Each",   "locations": ["Ward-A","Ward-B","ER","ICU","Laboratory"],       "synonyms": ["sharps bin","needle box","biohazard container","sharps disposal"]},
    {"name": "Autoclave Pouches (Pack)",   "category": "Sterilisation",     "unit": "Pack",   "locations": ["OR-1","OR-2","CSSD"],                           "synonyms": ["sterilisation bags","sterilization pouch","autoclave bag","CSSD pouches"]},
]

# ─── Generators ───────────────────────────────────────────────────────────────

def generate_patients(n=600):
    patients = []
    for i in range(1, n + 1):
        raw_id = f"P_{i:04d}"
        masked_id = masker.mask_patient(raw_id)

        age = random.randint(18, 90)
        gender = random.choice(GENDERS)
        blood_type = random.choice(BLOOD_TYPES)
        num_diagnoses = random.randint(1, 4)
        diagnoses = random.sample(DIAGNOSES, k=num_diagnoses)
        num_symptoms = random.randint(2, 6)
        symptoms = random.sample(SYMPTOMS, k=num_symptoms)

        # Vitals — slightly adjusted by age/diagnosis
        systolic_offset = 15 if "Hypertension" in diagnoses else 0
        hr_offset = 10 if "Atrial Fibrillation" in diagnoses else 0
        rr_offset = 4 if any(d in diagnoses for d in ["COPD", "Asthma", "Community-Acquired Pneumonia"]) else 0

        vitals = {
            "systolic_bp": min(200, random.randint(100, 145) + systolic_offset),
            "diastolic_bp": random.randint(60, 95),
            "heart_rate": min(130, random.randint(60, 95) + hr_offset),
            "temperature_c": round(random.uniform(36.4, 38.9), 1),
            "respiratory_rate": min(28, random.randint(12, 18) + rr_offset),
            "spo2_percent": random.randint(92, 100),
            "weight_kg": round(random.uniform(50, 120), 1),
            "height_cm": random.randint(150, 190),
        }

        # Visit history — 2–6 visits
        num_visits = random.randint(2, 6)
        visits = []
        for v in range(num_visits):
            days_ago = random.randint(v * 30, (v + 1) * 90)
            visits.append({
                "date": (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d"),
                "reason": random.choice(VISIT_REASONS),
                "department": random.choice(DEPARTMENTS),
            })

        # Medications (cross-referenced by masked med ID)
        num_meds = random.randint(1, 4)
        med_indices = random.sample(range(len(MEDICINES)), k=num_meds)
        medications = [masker.mask_medicine(f"MED_{idx+1:03d}") for idx in med_indices]

        # Keywords — used by retrieval
        keywords = (
            ["patient", gender.lower(), blood_type, f"age {age}"]
            + [d.lower() for d in diagnoses]
            + [s.lower() for s in symptoms]
        )
        keywords = list(dict.fromkeys(keywords))  # deduplicate, preserve order

        patients.append({
            "patient_id": masked_id,        # masked only — raw ID never stored
            "age": age,
            "gender": gender,
            "blood_type": blood_type,
            "diagnoses": diagnoses,
            "symptoms": symptoms,
            "vitals": vitals,
            "medications": medications,
            "visit_history": visits,
            "keywords": keywords,
        })
    return patients


def generate_medicines(n=250):
    medicines = []
    base = len(MEDICINES)

    for i in range(1, n + 1):
        raw_id = f"MED_{i:03d}"
        masked_id = masker.mask_medicine(raw_id)
        template = MEDICINES[(i - 1) % base]

        # Create dosage variety
        dosage = random.choice(template["dosages"])
        stock = random.randint(20, 500)
        reorder_level = random.randint(10, 50)
        batch_suffix = random.randint(1000, 9999)
        expiry_days = random.randint(90, 730)

        keywords = (
            [template["name"].lower(), template["form"].lower()]
            + [ind.lower() for ind in template["indications"]]
            + template["synonyms"]
        )
        keywords = list(dict.fromkeys(keywords))

        medicines.append({
            "medicine_id": masked_id,
            "name": template["name"],
            "dosage": dosage,
            "form": template["form"],
            "indications": template["indications"],
            "contraindications": template["contraindications"],
            "stock_units": stock,
            "reorder_level": reorder_level,
            "batch_id": masker.hash_id(f"BATCH-{raw_id}-{batch_suffix}", length=10),
            "expiry_date": (datetime.now() + timedelta(days=expiry_days)).strftime("%Y-%m-%d"),
            "synonyms": template["synonyms"],
            "keywords": keywords,
        })
    return medicines


def generate_instruments(n=175):
    instruments = []
    base = len(INSTRUMENTS)
    statuses = ["Operational", "Under Maintenance", "Calibration Due", "Out of Service"]
    status_weights = [0.70, 0.15, 0.10, 0.05]
    maint_statuses = ["Up to Date", "Due in 30 days", "Overdue"]

    for i in range(1, n + 1):
        raw_id = f"INS_{i:03d}"
        masked_id = masker.mask_instrument(raw_id)
        template = INSTRUMENTS[(i - 1) % base]

        department = random.choice(template["departments"])
        location = random.choice(LOCATIONS)
        status = random.choices(statuses, weights=status_weights)[0]
        maint_status = random.choice(maint_statuses)
        last_cal_days = random.randint(1, 365)
        next_cal_days = random.randint(30, 365)

        keywords = (
            [template["name"].lower(), template["category"].lower(), department.lower()]
            + template["synonyms"]
        )
        keywords = list(dict.fromkeys(keywords))

        instruments.append({
            "instrument_id": masked_id,
            "name": template["name"],
            "category": template["category"],
            "department": department,
            "location": location,
            "operational_status": status,
            "maintenance_status": maint_status,
            "last_calibration": (datetime.now() - timedelta(days=last_cal_days)).strftime("%Y-%m-%d"),
            "next_calibration": (datetime.now() + timedelta(days=next_cal_days)).strftime("%Y-%m-%d"),
            "synonyms": template["synonyms"],
            "keywords": keywords,
        })
    return instruments


def generate_inventory(n=175):
    inventory = []
    base = len(INVENTORY_ITEMS)
    inv_statuses = ["In Stock", "Low Stock", "Out of Stock", "On Order"]
    status_weights = [0.60, 0.25, 0.08, 0.07]

    for i in range(1, n + 1):
        raw_id = f"INV_{i:03d}"
        masked_id = masker.mask_inventory(raw_id)
        template = INVENTORY_ITEMS[(i - 1) % base]

        quantity = random.randint(0, 300)
        reorder_level = random.randint(10, 60)
        status = "Out of Stock" if quantity == 0 else (
            "Low Stock" if quantity < reorder_level else
            random.choices(inv_statuses[:2] + inv_statuses[3:], weights=[0.70, 0.10, 0.20])[0]
        )
        location = random.choice(template["locations"])

        keywords = (
            [template["name"].lower(), template["category"].lower(), location.lower()]
            + template["synonyms"]
        )
        keywords = list(dict.fromkeys(keywords))

        inventory.append({
            "item_id": masked_id,
            "item_name": template["name"],
            "category": template["category"],
            "quantity": quantity,
            "unit": template["unit"],
            "location": location,
            "reorder_level": reorder_level,
            "status": status,
            "synonyms": template["synonyms"],
            "keywords": keywords,
        })
    return inventory


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("Generating synthetic hospital dataset...")
    print(f"Output directory: {OUTPUT_DIR.resolve()}\n")

    data = {
        "patients.json":   generate_patients(600),
        "medicines.json":  generate_medicines(250),
        "instruments.json": generate_instruments(175),
        "inventory.json":  generate_inventory(175),
    }

    total = 0
    for filename, records in data.items():
        path = OUTPUT_DIR / filename
        path.write_text(json.dumps(records, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"  [OK] {filename:<22} {len(records):>4} records -> {path}")
        total += len(records)

    print(f"\nTotal records generated: {total}")

    # Quick PII validation
    print("\nRunning PII validation...")
    violations_found = 0
    for filename, records in data.items():
        for record in records:
            v = PIIMasker.validate_no_pii(record)
            if v:
                print(f"  [WARN] {filename}: {v}")
                violations_found += 1
    if violations_found == 0:
        print("  [OK] No PII violations detected.")
    else:
        print(f"  [FAIL] {violations_found} violation(s) found - review output.")

    print("\nDone.")


if __name__ == "__main__":
    main()
