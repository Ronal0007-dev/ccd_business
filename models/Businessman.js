const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Businessman = sequelize.define('Businessman', {
  id:           { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  locationId:   { type: DataTypes.INTEGER, allowNull: false },
  blockId:      { type: DataTypes.INTEGER, allowNull: true },
  cabinNumber:  { type: DataTypes.STRING(30), allowNull: true },
  fullName:     { type: DataTypes.STRING(150), allowNull: false },
  gender:       { type: DataTypes.ENUM('Male', 'Female'), allowNull: false },
  nin: {
    type: DataTypes.STRING(25), allowNull: false, unique: true,
    validate: { is: /^\d{8}-\d{5}-\d{5}-\d{2}$/ }
  },
  age:          { type: DataTypes.INTEGER, allowNull: false },
  tin:          { type: DataTypes.STRING(30), allowNull: true },
  mobileNumber: { type: DataTypes.STRING(20), allowNull: false },
  businessType: { type: DataTypes.STRING(150), allowNull: false },
  registeredBy: { type: DataTypes.INTEGER, allowNull: false }
}, {
  tableName: 'businessmen',
  indexes: [
    // Speeds up location/block filter dropdowns and counts
    { fields: ['locationId'] },
    { fields: ['blockId'] },
    // Speeds up gender filter
    { fields: ['gender'] },
    // Speeds up "registered by" lookups (used in views + reports)
    { fields: ['registeredBy'] },
    // Speeds up default sort order (createdAt DESC) used on every list page
    { fields: ['createdAt'] },
    // Composite index for the most common combined filter (location + gender)
    { fields: ['locationId', 'gender'] },
    // Speeds up name searches (LIKE 'x%' can use this prefix index in MySQL)
    { fields: ['fullName'] },
    { fields: ['mobileNumber'] },
    { fields: ['businessType'] }
  ]
});

module.exports = Businessman;
