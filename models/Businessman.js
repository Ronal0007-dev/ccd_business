const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Businessman = sequelize.define('Businessman', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  locationId: { type: DataTypes.INTEGER, allowNull: false },
  fullName: { type: DataTypes.STRING(150), allowNull: false },
  gender: { type: DataTypes.ENUM('Male', 'Female'), allowNull: false },
  nin: {
    type: DataTypes.STRING(25),
    allowNull: false,
    unique: true,
    validate: {
      is: /^\d{8}-\d{5}-\d{5}-\d{2}$/
    }
  },
  age: { type: DataTypes.INTEGER, allowNull: false },
  tin: { type: DataTypes.STRING(30), allowNull: true },
  mobileNumber: { type: DataTypes.STRING(20), allowNull: false },
  businessType: { type: DataTypes.STRING(150), allowNull: false },
  registeredBy: { type: DataTypes.INTEGER, allowNull: false }
}, { tableName: 'businessmen' });

module.exports = Businessman;
