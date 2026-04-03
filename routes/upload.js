var express = require("express");
var router = express.Router();
let { uploadImage, uploadExcel } = require('../utils/upload')
let path = require('path')
let exceljs = require('exceljs')
let categoryModel = require('../schemas/categories');
let productModel = require('../schemas/products')
let inventoryModel = require('../schemas/inventories')
let mongoose = require('mongoose')
let slugify = require('slugify')
let userModel = require('../schemas/users');
let roleModel = require('../schemas/roles');
let GenToken = require('../utils/GenToken');
let senMailHandler = require('../utils/senMailHandler');

router.post('/one_file', uploadImage.single('file'), function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send({
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size
    })
})
router.post('/multiple_file', uploadImage.array('files'), function (req, res, next) {
    if (!req.files) {
        res.status(404).send({
            message: "file khong duoc de trong"
        })
        return
    }
    res.send(req.files.map(f => {
        return {
            filename: f.filename,
            path: f.path,
            size: f.size
        }
    }))
})
router.get('/:filename', function (req, res, next) {
    let pathFile = path.join(__dirname, "../uploads", req.params.filename);
    res.sendFile(pathFile)
})
router.post('/excel', uploadExcel.single('file'), async function (req, res, next) {
    //workbook->worksheet->row/column->cell
    let workbook = new exceljs.Workbook();
    let pathFile = path.join(__dirname, "../uploads", req.file.filename);
    await workbook.xlsx.readFile(pathFile)
    let worksheet = workbook.worksheets[0];
    let result = [];
    let categories = await categoryModel.find({});
    let categoriesMap = new Map();
    for (const category of categories) {
        categoriesMap.set(category.name, category._id)
    }
    let products = await productModel.find({});
    let getTitle = products.map(p => p.title);
    let getSku = products.map(p => p.sku)
    for (let row = 2; row <= worksheet.rowCount; row++) {
        let rowErrors = [];
        const cells = worksheet.getRow(row);
        let sku = cells.getCell(1).value;
        let title = cells.getCell(2).value;
        let category = cells.getCell(3).value;//hop le
        let price = Number.parseInt(cells.getCell(4).value);
        let stock = Number.parseInt(cells.getCell(5).value);
        if (price < 0 || isNaN(price)) {
            rowErrors.push("price phai so duong")
        }
        if (stock < 0 || isNaN(stock)) {
            rowErrors.push("stock phai so duong")
        }
        if (!categoriesMap.has(category)) {
            rowErrors.push('category khong hop le')
        }
        if (getTitle.includes(title)) {
            rowErrors.push('title da ton tai')
        }
        if (getSku.includes(sku)) {
            rowErrors.push('sku da ton tai')
        }
        if (rowErrors.length > 0) {
            result.push(rowErrors);
            continue;
        }
        let session = await mongoose.startSession();
        session.startTransaction()
        try {
            let newObj = new productModel({
                sku:sku,
                title: title,
                slug: slugify(title, {
                    replacement: '-', lower: true, locale: 'vi',
                }),
                price: price,
                description: title,
                category: categoriesMap.get(category)
            })
            await newObj.save({ session })
            let newInventory = new inventoryModel({
                product: newObj._id,
                stock: stock
            })
            await newInventory.save({ session })
            await session.commitTransaction();
            await session.endSession()
            await newInventory.populate('product')
            getSku.push(sku);
            getTitle.push(title)
            result.push(newInventory);
        } catch (error) {
            await session.abortTransaction();
            await session.endSession()
            result.push(error.message);
        }
        //khong co loi
    }
    res.send(result)
})

router.post('/users_csv', uploadExcel.single('file'), async function (req, res, next) {
    if (!req.file) {
        return res.status(400).send({ message: "File không được để trống" });
    }

    let result = [];
    let errors = [];
    
    try {
        let userRole = await roleModel.findOne({ name: "user" });
        if (!userRole) {
            userRole = new roleModel({ name: "user", description: "Người dùng thường" });
            await userRole.save();
        }

        let pathFile = path.join(__dirname, "../uploads", req.file.filename);
        let dataRows = []; 

        if (req.file.originalname.endsWith('.csv')) {
            const fileContent = fs.readFileSync(pathFile, 'utf-8');
            const lines = fileContent.split(/\r?\n/); 
            
            for (let i = 1; i < lines.length; i++) { 
                if (!lines[i].trim()) continue; 
                let cols = lines[i].split(',');
                if (cols.length >= 2) {
                    dataRows.push({ username: cols[0], email: cols[1] });
                }
            }
        } else {
            const workbook = new exceljs.Workbook();
            await workbook.xlsx.readFile(pathFile);
            const worksheet = workbook.worksheets[0];
            
            for (let i = 2; i <= worksheet.rowCount; i++) {
                let row = worksheet.getRow(i);
                
                let uCell = row.getCell(1).value;
                let eCell = row.getCell(2).value;

                // GIẢI MÃ HYPERLINK VÀ OBJECT TỪ EXCEL
                let u = (typeof uCell === 'object' && uCell !== null) ? (uCell.text || uCell.result || '') : uCell;
                let e = (typeof eCell === 'object' && eCell !== null) ? (eCell.text || eCell.result || '') : eCell;

                if (uCell?.richText) u = uCell.richText.map(t=>t.text).join('');
                if (eCell?.richText) e = eCell.richText.map(t=>t.text).join('');

                dataRows.push({ username: u, email: e });
            }
        }

        if (dataRows.length === 0) {
            return res.status(400).send({ message: "Không tìm thấy dữ liệu trong file" });
        }

        for (let i = 0; i < dataRows.length; i++) {
            try {
                let username = dataRows[i].username;
                let email = dataRows[i].email;

                if (!username || !email) continue; 
                
                // Làm sạch mọi khoảng trắng thừa
                username = String(username).replace(/\s/g, '').replace(/"/g, '').trim();
                email = String(email).replace(/\s/g, '').replace(/"/g, '').trim();

                if (!username || !email) continue; 

                let checkExist = await userModel.findOne({ 
                    $or: [{ username: username }, { email: email }] 
                });
                
                if (checkExist) {
                    errors.push(`Dòng ${i+2}: ${username} hoặc ${email} đã tồn tại.`);
                    continue; 
                }

                let randomPassword = GenToken.RandomToken(16);

                let newUser = new userModel({
                    username: username,
                    email: email,
                    password: randomPassword, 
                    role: userRole._id
                });
                
                await newUser.save(); 
                await senMailHandler.sendPasswordMail(email, randomPassword);

                result.push(newUser.username);
            } catch (errRow) {
                errors.push(`Dòng ${i+2} lỗi: ${errRow.message}`);
            }
        }

        res.send({ 
            message: "Thực thi hoàn tất", 
            importedUsers: result,
            errors: errors 
        });
    } catch (error) {
        console.log("LỖI CHI TIẾT:", error); 
        res.status(500).send({ message: "Lỗi Server: " + error.message });
    }
});
module.exports = router;